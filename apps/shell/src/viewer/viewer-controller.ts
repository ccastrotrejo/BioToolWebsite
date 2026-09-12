import type { Subscription } from 'rxjs';
import { Vec3, Quat } from 'molstar/lib/mol-math/linear-algebra';
import { EveryLoci } from 'molstar/lib/mol-model/loci';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import { SecondaryStructure } from 'molstar/lib/mol-plugin/behavior/dynamic/custom-props/computed/secondary-structure';
import type { PluginStateObject } from 'molstar/lib/mol-plugin-state/objects';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import type { StateObjectSelector } from 'molstar/lib/mol-state';
import type { ColorTheme } from 'molstar/lib/mol-theme/color';
import { Color } from 'molstar/lib/mol-util/color';
import { ButtonsType } from 'molstar/lib/mol-util/input/input-observer';
import { MarkerAction } from 'molstar/lib/mol-util/marker-action';
import type { Protein, SourceFile } from '@biotool/core/domain/types';
import type { MoleculeViewerProps, ViewerHandle } from './types';
import { LatestTaskQueue } from './lifecycle';
import { ResidueMap } from './residue-map';
import { createPropensityTheme } from './propensity-theme';
import { viewerSourceData } from './source-data';
import { scaleCameraDistance } from './camera';

type StructureNode = StateObjectSelector<PluginStateObject.Molecule.Structure>;
type DisplayProps = Pick<MoleculeViewerProps,
  'representation' | 'colorMode' | 'appearance' | 'showLigands' | 'chainKey'>;
export interface ViewerStatus {
  loading: boolean;
  error: boolean;
  message: string;
}
interface ViewerCallbacks {
  onStatus: (status: ViewerStatus) => void;
  onSelect: MoleculeViewerProps['onSelect'];
  onHover: MoleculeViewerProps['onHover'];
  onReady: MoleculeViewerProps['onReady'];
  onError: MoleculeViewerProps['onError'];
}

const webGlError = 'The molecular viewer could not start WebGL. Enable hardware acceleration or try another browser.';

function errorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return detail === webGlError ? detail : `Unable to display this structure: ${detail}`;
}

function cameraDuration(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
}

/** A plugin and canvas belong to exactly one React effect/source lifetime. */
export class ViewerController implements ViewerHandle {
  private readonly plugin: PluginContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly queue = new LatestTaskQueue();
  private readonly subscriptions: Subscription[] = [];
  private observer?: ResizeObserver;
  private initialization?: Promise<void>;
  private root?: StructureNode;
  private mapping?: ResidueMap;
  private propensityTheme?: ColorTheme.Provider<{}>;
  private components: StructureNode[] = [];
  private display?: DisplayProps;
  private selection: readonly string[] = [];
  private hoverKey: string | null = null;
  private emittedHover: string | null = null;
  private ready = false;
  private firstView = true;
  private contextLost = false;
  private pointerStartedOnCanvas = false;

  constructor(
    private readonly host: HTMLDivElement,
    private readonly source: SourceFile,
    private readonly protein: Protein,
    private readonly callbacks: ViewerCallbacks,
  ) {
    // No download actions, remote annotations, volume streaming, or default UI.
    this.plugin = new PluginContext({
      actions: [],
      behaviors: [PluginSpec.Behavior(SecondaryStructure)],
      layout: { initial: { isExpanded: false, showControls: false } },
      canvas3d: {
        transparentBackground: true,
        checkeredTransparentBackground: false,
        camera: { mode: 'perspective' },
        cameraResetDurationMs: 0,
        trackball: { animate: { name: 'off', params: {} } },
        renderer: { backgroundColor: Color(0x0c1520) },
      },
    });
    // Mol* exposes duplicate readiness promises; failures are handled by the
    // awaited init methods below, including its asynchronously rejected mirror.
    void this.plugin.initialized.catch(() => {});
    void this.plugin.canvas3dInitialized.catch(() => {});
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', `${protein.title || source.id} molecular structure`);
    this.canvas.setAttribute('role', 'img');
    this.canvas.textContent = 'Interactive molecular structure. Use the sequence and camera controls for keyboard navigation.';
    Object.assign(this.canvas.style, { width: '100%', height: '100%', display: 'block' });
    host.prepend(this.canvas);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.ownerDocument.addEventListener('pointerdown', this.onPointerStart, true);
  }

  private onPointerStart = (event: PointerEvent) => {
    this.pointerStartedOnCanvas = event.target === this.canvas;
  };

  private onContextLost = () => {
    if (this.queue.active) {
      this.contextLost = true;
      this.reportError(new Error(webGlError));
    }
  };

  private reportError = (error: unknown) => {
    this.ready = false;
    const message = errorMessage(error);
    this.callbacks.onStatus({ loading: false, error: true, message });
    this.callbacks.onError(message);
  };

  private async initialize(): Promise<void> {
    await this.plugin.init();
    if (!this.queue.active) return;
    if (!await this.plugin.initViewerAsync(this.canvas, this.host)) throw new Error(webGlError);
    if (!this.queue.active) return;
    this.observer = new ResizeObserver(() => {
      if (this.queue.active) this.plugin.handleResize();
    });
    this.observer.observe(this.host);
    const data = await this.plugin.builders.data.rawData({
      data: viewerSourceData(this.source),
      label: this.source.filename,
    });
    if (!this.queue.active) return;
    const trajectory = await this.plugin.builders.structure.parseTrajectory(
      data, this.source.format === 'pdb' ? 'pdb' : 'mmcif',
    );
    if (!this.queue.active) return;
    const model = await this.plugin.builders.structure.createModel(trajectory, { modelIndex: 0 });
    if (!this.queue.active) return;
    this.root = await this.plugin.builders.structure.createStructure(model, { name: 'model', params: {} });
    if (!this.queue.active) return;
    const structure = this.root.obj?.data;
    if (!structure?.elementCount) throw new Error('The first model has no displayable atoms.');
    this.mapping = new ResidueMap(structure, this.protein, this.source.format);
    this.propensityTheme = createPropensityTheme(this.protein, this.mapping);
    this.plugin.representation.structure.themes.colorThemeRegistry.add(this.propensityTheme);
    this.subscribeToPicking();
  }

  private subscribeToPicking(): void {
    this.subscriptions.push(this.plugin.behaviors.interaction.hover.subscribe(event => {
      if (!this.ready || !this.mapping) return;
      const key = this.mapping.keysFromLoci(event.current.loci, this.display?.chainKey ?? null)[0] ?? null;
      this.markHover(key);
      if (key !== this.emittedHover) {
        this.emittedHover = key;
        this.callbacks.onHover(key);
      }
    }));
    this.subscriptions.push(this.plugin.behaviors.interaction.click.subscribe(event => {
      // Mol* listens for window-level mouse-up events to support dragging.
      // An unrelated control must never clear a sequence-driven selection.
      if (!this.pointerStartedOnCanvas || !this.ready || !this.mapping || event.button !== ButtonsType.Flag.Primary) return;
      this.pointerStartedOnCanvas = false;
      const keys = this.mapping.keysFromLoci(event.current.loci, this.display?.chainKey ?? null);
      if (event.modifiers.shift || event.modifiers.control || event.modifiers.meta) {
        const next = new Set(this.selection);
        for (const key of keys) {
          if (next.has(key)) next.delete(key);
          else next.add(key);
        }
        this.callbacks.onSelect([...next]);
      } else {
        this.callbacks.onSelect(keys);
      }
    }));
  }

  update(display: DisplayProps): void {
    this.ready = false;
    this.callbacks.onStatus({ loading: true, error: false, message: 'Preparing molecular view…' });
    this.queue.enqueue(async isCurrent => {
      if (this.contextLost) throw new Error(webGlError);
      this.initialization ??= this.initialize();
      await this.initialization;
      if (!isCurrent() || !this.root || !this.mapping || !this.propensityTheme) return;
      this.display = display;
      this.plugin.canvas3d?.setProps({
        transparentBackground: true,
        checkeredTransparentBackground: false,
        renderer: {
          backgroundColor: Color(display.appearance === 'dark' ? 0x0c1520 : 0xf0f5f7),
          highlightColor: Color(display.appearance === 'dark' ? 0xffffff : 0x116a81),
          selectColor: Color(0xff785e),
        },
      });
      if (this.components.length) {
        const update = this.plugin.build();
        for (const component of this.components) update.delete(component.ref);
        await update.commit();
        this.components = [];
        if (!isCurrent()) return;
      }
      const polymer = await this.plugin.builders.structure.tryCreateComponentFromExpression(
        this.root, this.mapping.polymerExpression(display.chainKey), 'biotool-polymer', { label: 'Polymer' },
      );
      if (polymer) this.components.push(polymer);
      if (!isCurrent()) return;
      if (!polymer) throw new Error('No polymer atoms match the selected chain.');
      const registry = this.plugin.representation.structure;
      const color = display.colorMode === 'propensity' ? this.propensityTheme
        : registry.themes.colorThemeRegistry.get(display.colorMode === 'element' ? 'element-symbol' : 'chain-id');
      await this.plugin.builders.structure.representation.addRepresentation(polymer, {
        type: registry.registry.get(display.representation),
        color,
      });
      if (!isCurrent()) return;
      if (display.showLigands) {
        const ligand = await this.plugin.builders.structure.tryCreateComponentFromExpression(
          this.root,
          MS.struct.generator.atomGroups({
            'entity-test': MS.core.logic.and([
              MS.core.rel.neq([MS.struct.atomProperty.macromolecular.entityType(), 'polymer']),
              MS.core.rel.neq([MS.struct.atomProperty.macromolecular.entityType(), 'water']),
            ]),
          }),
          'biotool-ligands', { label: 'Ligands (outside sequence analysis)' },
        );
        if (ligand) this.components.push(ligand);
        if (!isCurrent()) return;
        if (ligand) {
          await this.plugin.builders.structure.representation.addRepresentation(ligand, {
            type: 'ball-and-stick', color: 'element-symbol',
          });
        }
      }
      if (!isCurrent() || this.contextLost) return;
      this.ready = true;
      this.highlight(this.selection, this.hoverKey);
      this.plugin.handleResize();
      if (this.firstView) {
        this.plugin.managers.camera.reset(undefined, 0);
        this.firstView = false;
      }
      this.callbacks.onStatus({ loading: false, error: false, message: '' });
      this.callbacks.onReady();
    }, this.reportError);
  }

  highlight(selection: readonly string[], hoverKey: string | null): void {
    this.selection = selection;
    this.hoverKey = hoverKey;
    if (!this.ready || !this.mapping) return;
    const canvas = this.plugin.canvas3d;
    canvas?.mark({ loci: EveryLoci }, MarkerAction.Deselect);
    canvas?.mark({
      loci: this.mapping.lociForKeys(selection, this.display?.chainKey ?? null),
    }, MarkerAction.Select);
    this.markHover(hoverKey);
  }

  private markHover(key: string | null): void {
    if (!this.mapping) return;
    this.plugin.canvas3d?.mark({ loci: EveryLoci }, MarkerAction.RemoveHighlight);
    if (key !== null) {
      this.plugin.canvas3d?.mark({
        loci: this.mapping.lociForKeys([key], this.display?.chainKey ?? null),
      }, MarkerAction.Highlight);
    }
  }

  reset = (): void => {
    if (!this.ready) return;
    this.plugin.canvas3d?.requestCameraReset({
      durationMs: cameraDuration(),
      snapshot: (scene, camera) => camera.getInvariantFocus(
        scene.boundingSphereVisible.center,
        scene.boundingSphereVisible.radius,
        Vec3.create(0, 1, 0),
        Vec3.create(0, 0, -1),
      ),
    });
  };

  focus = (): void => {
    if (!this.ready || !this.mapping) return;
    const loci = this.mapping.lociForKeys(this.selection, this.display?.chainKey ?? null);
    if (StructureElement.Loci.isEmpty(loci)) this.reset();
    else this.plugin.managers.camera.focusLoci(loci, { durationMs: cameraDuration() });
  };

  rotate = (axis: 'x' | 'y', degrees: number): void => {
    const camera = this.plugin.canvas3d?.camera;
    if (!this.ready || !camera || !Number.isFinite(degrees)) return;
    const snapshot = camera.getSnapshot();
    const rotation = Quat.setAxisAngle(Quat(), axis === 'x' ? Vec3.create(1, 0, 0) : Vec3.create(0, 1, 0), degrees * Math.PI / 180);
    const offset = Vec3.sub(Vec3(), snapshot.position, snapshot.target);
    Vec3.transformQuat(offset, offset, rotation);
    const position = Vec3.add(Vec3(), snapshot.target, offset);
    const up = Vec3.transformQuat(Vec3(), snapshot.up, rotation);
    this.plugin.managers.camera.setSnapshot({ position, up }, cameraDuration());
  };

  zoom = (factor: number): void => {
    const camera = this.plugin.canvas3d?.camera;
    if (!this.ready || !camera || !Number.isFinite(factor) || factor <= 0) return;
    const snapshot = camera.getSnapshot();
    const offset = Vec3.sub(Vec3(), snapshot.position, snapshot.target);
    const distance = Vec3.magnitude(offset);
    if (distance === 0) return;
    const nextDistance = scaleCameraDistance(distance, factor);
    Vec3.scale(offset, offset, nextDistance / distance);
    this.plugin.managers.camera.setSnapshot({
      position: Vec3.add(Vec3(), snapshot.target, offset),
    }, cameraDuration());
  };

  downloadImage = async (): Promise<void> => {
    await this.queue.run(async () => {
      const screenshot = this.plugin.helpers.viewportScreenshot;
      if (!this.ready || !screenshot) throw new Error('Wait for the molecular view to finish loading before exporting an image.');
      screenshot.behaviors.values.next({
        ...screenshot.values,
        format: { name: 'png', params: {} },
        resolution: { name: 'viewport', params: {} },
      });
      const image = await screenshot.getImageDataUri();
      if (!this.queue.active) return;
      const link = document.createElement('a');
      link.href = image;
      link.download = `${this.source.id.replace(/[^a-zA-Z0-9._-]/g, '_') || 'structure'}.png`;
      document.body.append(link);
      link.click();
      link.remove();
    }, error => {
      this.callbacks.onError(`Unable to export the molecular image: ${error instanceof Error ? error.message : String(error)}`);
    });
  };

  dispose(): void {
    this.ready = false;
    this.observer?.disconnect();
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.ownerDocument.removeEventListener('pointerdown', this.onPointerStart, true);
    this.plugin.animationLoop.stop();
    this.plugin.managers.task.requestAbortAll('Viewer source changed or viewer unmounted.');
    this.canvas.remove();
    void this.queue.stop(() => {
      this.plugin.helpers.viewportScreenshot?.dispose();
      this.plugin.dispose();
    });
  }
}
