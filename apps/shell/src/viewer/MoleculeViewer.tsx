import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { MoleculeViewerProps, ViewerHandle } from './types';
import { ViewerController } from './viewer-controller';

/** Canvas-only Mol* view; the application owns all sequence and camera controls. */
export function MoleculeViewer(props: MoleculeViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ViewerController | null>(null);
  const latest = useRef(props);
  const [loading, setLoading] = useState(true);
  useLayoutEffect(() => { latest.current = props; });

  useImperativeHandle(props.viewerRef, (): ViewerHandle => ({
    reset: () => controller.current?.reset(),
    focus: () => controller.current?.focus(),
    rotate: (axis, degrees) => controller.current?.rotate(axis, degrees),
    zoom: factor => controller.current?.zoom(factor),
    downloadImage: async () => { await controller.current?.downloadImage(); },
  }), []);

  useEffect(() => {
    if (!host.current) return;
    const viewer = new ViewerController(host.current, props.source, props.protein, {
      onStatus: status => setLoading(status.loading),
      onReady: () => latest.current.onReady(),
      onError: message => latest.current.onError(message),
      onSelect: keys => latest.current.onSelect(keys),
      onHover: key => latest.current.onHover(key),
    });
    controller.current = viewer;
    viewer.update(latest.current);
    viewer.highlight(latest.current.selection, latest.current.hoverKey);
    return () => {
      controller.current = null;
      viewer.dispose();
    };
  }, [props.source, props.protein]);

  useEffect(() => {
    controller.current?.update({
      representation: props.representation,
      colorMode: props.colorMode,
      appearance: props.appearance,
      showLigands: props.showLigands,
      chainKey: props.chainKey,
    });
  }, [props.representation, props.colorMode, props.appearance, props.showLigands, props.chainKey]);

  useEffect(() => {
    controller.current?.highlight(props.selection, props.hoverKey);
  }, [props.selection, props.hoverKey]);

  // React must not reconcile children here: the controller owns the canvas.
  return (
    <div
      className="molecular-canvas"
      ref={host}
      role="region"
      aria-label="Interactive molecular viewer"
      aria-busy={loading}
    />
  );
}
