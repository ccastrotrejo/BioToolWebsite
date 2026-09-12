import { StrictMode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CIF } from 'molstar/lib/mol-io/reader/cif';
import { trajectoryFromMmCIF } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { Structure } from 'molstar/lib/mol-model/structure';
import { Task } from 'molstar/lib/mol-task';
import type { PartialCanvas3DProps } from 'molstar/lib/mol-canvas3d/canvas3d';
import type { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import type { Protein } from '../domain/types';
import { parseStructure } from '../formats/parse';
import { cifRow, mmcif, source } from '../formats/fixtures/structures';
import { MoleculeViewer } from './MoleculeViewer';
import type { MoleculeViewerProps } from './types';

interface PluginRecord {
  canvas: HTMLCanvasElement | null;
  initStarted: boolean;
  disposed: boolean;
  spec: PluginSpec | null;
  canvasUpdates: PartialCanvas3DProps[];
}

const renderer = vi.hoisted(() => ({
  records: [] as PluginRecord[],
  structure: undefined as Structure | undefined,
  barriers: [] as Promise<void>[],
  webgl: true,
}));

// Mock only the external graphics engine; exercise the real React component,
// controller, state queue, source decoding, identity mapping, and cleanup.
vi.mock('molstar/lib/mol-plugin/context', async () => {
  const { Subject } = await import('rxjs');
  class PluginContext {
    readonly record: PluginRecord = {
      canvas: null, initStarted: false, disposed: false, spec: null, canvasUpdates: [],
    };
    readonly initialized = Promise.resolve();
    readonly canvas3dInitialized = Promise.resolve();
    readonly behaviors = { interaction: { click: new Subject(), hover: new Subject() } };
    readonly canvas3d = {
      setProps: vi.fn((props: PartialCanvas3DProps) => { this.record.canvasUpdates.push(props); }),
      mark: vi.fn(),
    };
    readonly animationLoop = { stop: vi.fn() };
    readonly helpers = { viewportScreenshot: { dispose: vi.fn() } };
    readonly managers = { task: { requestAbortAll: vi.fn() }, camera: { reset: vi.fn() } };
    readonly representation = {
      structure: {
        registry: { get: vi.fn(() => ({})) },
        themes: { colorThemeRegistry: { add: vi.fn(), get: vi.fn(() => ({})) } },
      },
    };
    readonly builders = {
      data: { rawData: vi.fn(async () => ({})) },
      structure: {
        parseTrajectory: vi.fn(async () => ({})),
        createModel: vi.fn(async () => ({})),
        createStructure: vi.fn(async () => ({ ref: 'structure', obj: { data: renderer.structure } })),
        tryCreateComponentFromExpression: vi.fn(async () => ({ ref: 'polymer' })),
        representation: { addRepresentation: vi.fn(async () => ({})) },
      },
    };
    constructor(spec: PluginSpec) {
      this.record.spec = spec;
      renderer.records.push(this.record);
    }
    async init() {
      this.record.initStarted = true;
      await renderer.barriers.shift();
    }
    async initViewerAsync(canvas: HTMLCanvasElement) {
      this.record.canvas = canvas;
      return renderer.webgl;
    }
    handleResize() {}
    build() { return { delete: vi.fn(), commit: vi.fn(async () => {}) }; }
    dispose() { this.record.disposed = true; }
  }
  return { PluginContext };
});

const fixture = source(mmcif([1, 2, 3].map(index => cifRow({
  id: String(index), auth_seq_id: String(index), label_seq_id: String(index),
}))), 'mmcif');
let protein: Protein;
const originalResizeObserver = globalThis.ResizeObserver;

beforeAll(async () => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  protein = await parseStructure(fixture);
  const parsed = await CIF.parseText(String(fixture.data)).run();
  if (parsed.isError) throw new Error(parsed.message);
  const block = parsed.result.blocks[0];
  if (!block) throw new Error('Missing fixture block');
  const trajectory = await trajectoryFromMmCIF(block).run();
  renderer.structure = Structure.ofModel(await Task.resolveInContext(trajectory.getFrameAtIndex(0)));
});

afterAll(() => {
  if (originalResizeObserver) globalThis.ResizeObserver = originalResizeObserver;
  else Reflect.deleteProperty(globalThis, 'ResizeObserver');
});

beforeEach(() => {
  renderer.records.length = 0;
  renderer.barriers.length = 0;
  renderer.webgl = true;
});

function props(): MoleculeViewerProps {
  return {
    source: fixture, protein, selection: [], hoverKey: null, chainKey: null,
    representation: 'cartoon', colorMode: 'chain', appearance: 'dark', showLigands: false,
    viewerRef: null, onSelect: vi.fn(), onHover: vi.fn(), onReady: vi.fn(), onError: vi.fn(),
  };
}

describe('molecular canvas ownership', () => {
  it('keeps exactly one connected canvas after StrictMode readiness and subsequent React updates', async () => {
    const input = props();
    const view = render(<StrictMode><MoleculeViewer {...input} /></StrictMode>);
    await waitFor(() => expect(input.onReady).toHaveBeenCalledOnce());
    const canvas = view.container.querySelector('.molecular-canvas > canvas');
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas?.isConnected).toBe(true);
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1);
    view.rerender(<StrictMode><MoleculeViewer {...input} representation="point" /></StrictMode>);
    await waitFor(() => expect(input.onReady).toHaveBeenCalledTimes(2));
    view.rerender(<StrictMode><MoleculeViewer {...input} representation="point" hoverKey={protein.residues[0]?.key ?? null} /></StrictMode>);
    expect(view.container.querySelector('.molecular-canvas > canvas')).toBe(canvas);
    expect(canvas?.isConnected).toBe(true);
    view.unmount();
    await waitFor(() => expect(renderer.records.every(record => record.disposed)).toBe(true));
    expect(canvas?.isConnected).toBe(false);
    expect(input.onError).not.toHaveBeenCalled();
  });

  it('does not detach the replacement canvas when a superseded initialization finishes', async () => {
    let release: () => void = () => {};
    renderer.barriers.push(new Promise<void>(resolve => { release = resolve; }));
    const input = props();
    const view = render(<MoleculeViewer {...input} />);
    await waitFor(() => expect(renderer.records[0]?.initStarted).toBe(true));
    const obsoleteCanvas = view.container.querySelector('canvas');
    const ready = vi.fn();
    view.rerender(<MoleculeViewer {...input} source={{ ...fixture, id: 'replacement' }} onReady={ready} />);
    await waitFor(() => expect(ready).toHaveBeenCalledOnce());
    const replacement = view.container.querySelector('.molecular-canvas > canvas');
    expect(replacement).not.toBe(obsoleteCanvas);
    await act(async () => { release(); });
    await waitFor(() => expect(renderer.records[0]?.disposed).toBe(true));
    expect(input.onReady).not.toHaveBeenCalled();
    expect(ready).toHaveBeenCalledOnce();
    expect(replacement?.isConnected).toBe(true);
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1);
    view.unmount();
    await waitFor(() => expect(renderer.records.every(record => record.disposed)).toBe(true));
  });

  it('reports no-WebGL errors to the parent without rendering a duplicate alert', async () => {
    renderer.webgl = false;
    const input = props();
    const view = render(<MoleculeViewer {...input} />);
    await waitFor(() => expect(input.onError).toHaveBeenCalledOnce());
    expect(input.onError).toHaveBeenCalledWith(expect.stringContaining('WebGL'));
    expect(input.onReady).not.toHaveBeenCalled();
    expect(view.queryByRole('alert')).toBeNull();
    expect(view.queryByRole('status')).toBeNull();
    expect(view.getByRole('region')).toHaveAttribute('aria-busy', 'false');
    view.unmount();
    await waitFor(() => expect(renderer.records.every(record => record.disposed)).toBe(true));
  });

  it('preserves a transparent background across dark and light appearance updates', async () => {
    const input = props();
    const view = render(<MoleculeViewer {...input} />);
    await waitFor(() => expect(input.onReady).toHaveBeenCalledOnce());
    const canvas = view.container.querySelector('.molecular-canvas > canvas');
    const record = renderer.records[0];
    const background = { transparentBackground: true, checkeredTransparentBackground: false };
    expect(record?.spec?.canvas3d).toMatchObject(background);
    view.rerender(<MoleculeViewer {...input} appearance="light" />);
    await waitFor(() => expect(input.onReady).toHaveBeenCalledTimes(2));
    expect(record?.canvasUpdates).toHaveLength(2);
    for (const update of record?.canvasUpdates ?? []) expect(update).toMatchObject(background);
    expect(view.container.querySelector('.molecular-canvas > canvas')).toBe(canvas);
    expect(canvas?.isConnected).toBe(true);
    view.unmount();
    await waitFor(() => expect(record?.disposed).toBe(true));
  });
});
