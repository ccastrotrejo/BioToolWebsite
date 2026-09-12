import { lazy, Suspense, useCallback, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import type { MoleculeViewerProps, Representation } from '../viewer/types';
import { Icon } from '../ui/Icon';

const Viewer = lazy(() => import('../viewer/MoleculeViewer').then((module) => ({ default: module.MoleculeViewer })));
const representations: { value: Representation; label: string }[] = [
  { value: 'cartoon', label: 'Ribbon' }, { value: 'ball-and-stick', label: 'Atoms' },
  { value: 'molecular-surface', label: 'Surface' }, { value: 'point', label: 'Points' },
];

interface MolecularPanelProps extends Omit<MoleculeViewerProps, 'onReady' | 'onError'> {
  onRepresentation: (value: Representation) => void;
  onRotate: (axis: 'x' | 'y', degrees: number) => void;
  onZoom: (factor: number) => void;
  onReset: () => void;
  onImage: () => void;
  onAvailability: (ready: boolean) => void;
}

export function MolecularPanel({ onRepresentation, onRotate, onZoom, onReset, onImage, onAvailability, ...viewerProps }: MolecularPanelProps) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onReady = useCallback(() => { setReady(true); setError(null); onAvailability(true); }, [onAvailability]);
  const onError = useCallback((message: string) => { setError(message); setReady(false); onAvailability(false); }, [onAvailability]);
  return <section className="molecular-panel" aria-label="Molecular structure">
    <div className="viewer-topbar"><div className="representation-switch" role="group" aria-label="Molecular representation">
      {representations.map((item) => <button key={item.value} aria-pressed={viewerProps.representation === item.value}
        onClick={() => onRepresentation(item.value)}>{item.label}</button>)}</div>
      <button className="icon-button" aria-label="Download molecular image" onClick={onImage} disabled={!ready}><Icon name="download" /></button>
    </div>
    <div className="viewer-stage" data-viewer-ready={ready} aria-busy={!ready && !error}>
      <div className="specimen-label"><span>{viewerProps.source.origin === 'local' ? 'LOCAL STRUCTURE' : viewerProps.source.id}</span>
        <small>Deposited model {viewerProps.protein.modelNumber}</small></div>
      <ErrorBoundary onError={(cause) => onError(cause instanceof Error ? cause.message : 'Molecular view unavailable. Reload to try again.')}
        fallbackRender={() => null}>
        <Suspense fallback={null}>
          <Viewer {...viewerProps} onReady={onReady} onError={onError} />
        </Suspense>
      </ErrorBoundary>
      {!ready && !error && <div className="viewer-message" role="status">Preparing molecular view<span className="loading-line" /></div>}
      {error && <div className="viewer-error" role="alert">{error} Sequence and analysis remain available.</div>}
      <div className="viewer-help">Drag to rotate · scroll to zoom</div>
      <div className="viewer-credit">Molecular view · Mol*</div>
    </div>
    <div className="camera-toolbar" role="group" aria-label="Camera controls">
      <button className="icon-button" onClick={() => onRotate('y', -20)} disabled={!ready} aria-label="Rotate left"><Icon name="left" /></button>
      <button className="icon-button" onClick={() => onRotate('x', -20)} disabled={!ready} aria-label="Rotate up"><Icon name="up" /></button>
      <span className="toolbar-rule" />
      <button className="icon-button" onClick={() => onZoom(0.8)} disabled={!ready} aria-label="Zoom in"><Icon name="plus" /></button>
      <button className="icon-button" onClick={() => onZoom(1.25)} disabled={!ready} aria-label="Zoom out"><Icon name="minus" /></button>
      <button className="button camera-reset" onClick={onReset} disabled={!ready}><Icon name="reset" size={15} /> Reset view</button>
      <span className="coordinate-note">Coordinates in Å</span>
    </div>
  </section>;
}
