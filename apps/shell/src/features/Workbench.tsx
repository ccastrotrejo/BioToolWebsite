import { useCallback, useMemo, useRef, useState } from 'react';
import type { Appearance } from '@biotool/core/domain/types';
import type { ColorMode, Representation, ViewerHandle } from '../viewer/types';
import { analyzeProtein } from '@biotool/core/analysis/analyze';
import { CATALOG } from '../data/catalog';
import { errorMessage, sourceLink } from '../data/source';
import { downloadFasta, downloadReport, downloadSource } from '@biotool/core/exports/download';
import { CompositionPanel } from './CompositionPanel';
import { TripletPanel } from './TripletPanel';
import { SelectionInspector } from './SelectionInspector';
import { SequencePanel } from './SequencePanel';
import { MolecularPanel } from './MolecularPanel';
import { ExportMenu } from './ExportMenu';
import type { Workspace } from './useWorkbench';
import { Icon } from '../ui/Icon';

interface WorkbenchProps {
  workspace: Workspace;
  appearance: Appearance;
  onError: (message: string) => void;
  onRefresh: () => void;
  busy: boolean;
}

export function Workbench({ workspace: { source, protein }, appearance, onError, onRefresh, busy }: WorkbenchProps) {
  const params = new URLSearchParams(window.location.search);
  const [chainKey, setChainKey] = useState<string | null>(() =>
    protein.chains.find((chain) => chain.key === params.get('chain'))?.key ?? null);
  const [selection, setSelection] = useState<string[]>([]);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [representation, setRepresentation] = useState<Representation>(() => {
    const value = params.get('view');
    return value === 'ball-and-stick' || value === 'molecular-surface' || value === 'point' ? value : 'cartoon';
  });
  const [colorMode, setColorMode] = useState<ColorMode>(() => {
    const value = params.get('color');
    return value === 'element' || value === 'propensity' ? value : 'chain';
  });
  const [showLigands, setShowLigands] = useState(false);
  const [activeTab, setActiveTab] = useState<'composition' | 'triplets'>('composition');
  const [message, setMessage] = useState('');
  const [viewerReady, setViewerReady] = useState(false);
  const viewer = useRef<ViewerHandle>(null);
  const analysis = useMemo(() => analyzeProtein(protein, chainKey), [protein, chainKey]);
  const example = source.origin !== 'local' ? CATALOG.find((item) => item.id === source.id) : undefined;
  const name = example?.name ?? (source.origin === 'local' ? source.filename : source.id);
  const url = sourceLink(source);
  const select = useCallback((keys: string[]) => { setSelection(keys); setHoverKey(null); }, []);
  const handleFasta = () => downloadFasta(source, protein, chainKey);
  const runExport = (action: () => void) => {
    try { action(); setMessage('Download prepared.'); }
    catch (cause) { onError(errorMessage(cause)); }
  };
  async function share() {
    const link = new URL(window.location.href);
    link.search = '';
    link.searchParams.set('pdb', source.id);
    link.searchParams.set('view', representation);
    link.searchParams.set('color', colorMode);
    if (chainKey) link.searchParams.set('chain', chainKey);
    try { await navigator.clipboard.writeText(link.href); setMessage('Structure link copied. It opens the latest public coordinates.'); }
    catch (cause) { onError(`Could not copy the link: ${errorMessage(cause)}`); }
  }
  return <main className="workbench" id="workbench" onKeyDown={(event) => {
    if (event.key === 'Escape') { setSelection([]); setHoverKey(null); }
  }}>
    <header className="structure-header">
      <div><div className="structure-title"><h1>{name}</h1>{source.origin !== 'local' && <span className="id-badge">{source.id}</span>}</div>
        <p className="structure-description">{example?.organism ?? 'Observed protein residues'}<span aria-hidden="true"> / </span>{example?.topic ?? source.format.toUpperCase()}</p></div>
      <div className="structure-actions">{url && <a className="button source-link" href={url} target="_blank" rel="noreferrer">RCSB entry <span aria-hidden="true">↗</span></a>}
        <ExportMenu onSource={() => runExport(() => downloadSource(source))} onFasta={() => runExport(handleFasta)}
          onReport={(kind) => runExport(() => downloadReport(source, protein, analysis, kind))}
          onShare={() => void share()} canShare={source.origin !== 'local'} /></div>
    </header>
    <div className="structure-summary">
      <div className="stat"><strong>{analysis.residueCount.toLocaleString()}</strong><span>observed residues</span></div>
      <div className="stat"><strong>{analysis.chainCount}</strong><span>{analysis.chainCount === 1 ? 'chain' : 'chains'}</span></div>
      <div className="stat"><strong>{analysis.atomCount.toLocaleString()}</strong><span>protein atoms</span></div>
      <label className="scope-control">Analysis scope<select value={chainKey ?? ''} onChange={(event) => {
        setChainKey(event.target.value || null); setSelection([]); setHoverKey(null);
      }}><option value="">All chains</option>{protein.chains.map((chain) =>
        <option key={chain.key} value={chain.key}>Chain {chain.label}</option>)}</select></label>
    </div>
    <div className="exploration-grid">
      <div className="structure-column">
        <MolecularPanel source={source} protein={protein} selection={selection} hoverKey={hoverKey} chainKey={chainKey}
          representation={representation} colorMode={colorMode} appearance={appearance} showLigands={showLigands}
          viewerRef={viewer} onSelect={select} onHover={setHoverKey} onRepresentation={setRepresentation}
          onRotate={(axis, degrees) => viewer.current?.rotate(axis, degrees)} onZoom={(factor) => viewer.current?.zoom(factor)}
          onReset={() => viewer.current?.reset()} onAvailability={setViewerReady} onImage={() => {
            void viewer.current?.downloadImage().catch((cause: unknown) => onError(errorMessage(cause)));
          }} />
        <div className="display-controls"><label>Color by<select value={colorMode} onChange={(event) => {
          const value = event.target.value;
          if (value === 'chain' || value === 'element' || value === 'propensity') setColorMode(value);
        }}>
          <option value="chain">Chain</option><option value="element">Element</option><option value="propensity">Triplet propensity</option>
        </select></label><label className="checkbox-label"><input type="checkbox" checked={showLigands} onChange={(event) => setShowLigands(event.target.checked)} /> Show ligands</label>
          <span className="display-scope">Display changes do not change counts.</span></div>
        {colorMode === 'propensity' && <p className="inline-caveat">Color shows the legacy triplet heuristic. Ribbon shape is based on structure; unscored residues are gray.</p>}
      </div>
      <aside className="analysis-panel" aria-label="Structure analysis">
        <div className="analysis-tabs" role="group" aria-label="Analysis view">
          <button aria-pressed={activeTab === 'composition'} onClick={() => setActiveTab('composition')}>Composition</button>
          <button aria-pressed={activeTab === 'triplets'} onClick={() => setActiveTab('triplets')}>Triplets</button></div>
        <div className="analysis-content" role="region" aria-label={activeTab === 'composition' ? 'Composition details' : 'Triplet details'} tabIndex={0}>{activeTab === 'composition'
          ? <CompositionPanel analysis={analysis} protein={protein} chainKey={chainKey} onSelect={select} />
          : <TripletPanel key={chainKey ?? 'all'} analysis={analysis} protein={protein} onSelect={select} />}</div>
        <SelectionInspector protein={protein} analysis={analysis} selection={selection} hoverKey={hoverKey}
          onClear={() => select([])} onFocus={() => viewer.current?.focus()} canFocus={viewerReady} />
      </aside>
    </div>
    <SequencePanel protein={protein} analysis={analysis} chainKey={chainKey} selection={selection} onSelect={select} onHover={setHoverKey}
      onFasta={() => runExport(handleFasta)} />
    <details className="provenance"><summary><Icon name="info" size={16} /> Source & analysis notes</summary>
      <div className="provenance-content"><h2>Know what you are looking at</h2><p>{protein.title}</p>
        {example && <p>{example.description}</p>}
        <p>Analysis uses observed CA residues from the first model. MSE is treated as methionine; other HETATM residues are excluded from counts.
          Observed sequences can omit gaps. Triplet propensity is an educational heuristic, not experimental secondary structure or a validated prediction.</p>
        {protein.warnings.length > 0 && <ul>{protein.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        <p>Source: {source.origin === 'local' ? 'Local file, processed on this device' : 'RCSB Protein Data Bank'} · {source.filename} · imported {new Date(source.fetchedAt).toLocaleString()}</p>
        {source.digest && <p className="source-digest">SHA-256: {source.digest}</p>}
        {url && <button className="button" onClick={onRefresh} disabled={busy}><Icon name="reset" size={15} /> Refresh from RCSB</button>}
        <p>Refreshing validates the new structure before replacing your saved copy. Archive files are CC0; cite the structure authors and PDB entry when using them.</p>
      </div>
    </details>
    <div className="sr-only" role="status">{selection.length > 0 ? `${selection.length} residues selected.` : 'Selection cleared.'}</div>
    {message && <p className="export-status" role="status">{message}</p>}
  </main>;
}
