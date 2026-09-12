import { useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import type { Appearance } from './domain/types';
import { clearLibrary, removeSaved } from './data/library';
import { errorMessage } from './data/source';
import { useWorkbench } from './features/useWorkbench';
import { useOffline } from './features/useOffline';
import { LibraryPanel } from './features/LibraryPanel';
import { SearchDialog } from './features/SearchDialog';
import { Workbench } from './features/Workbench';
import { Icon } from './ui/Icon';

export function App() {
  const workbench = useWorkbench();
  const [appearance, setAppearance] = useState<Appearance>('dark');
  const [searchOpen, setSearchOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const offline = useOffline();
  useEffect(() => { document.documentElement.dataset.theme = appearance; }, [appearance]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setSearchOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
  async function remove(id?: string) {
    if (!id && !window.confirm('Remove all saved structures from this browser? Export any work you want to keep first.')) return;
    try { if (id) await removeSaved(id); else await clearLibrary(); await workbench.refreshLibrary(); }
    catch (cause) { workbench.setError(errorMessage(cause)); }
  }
  return <div className="app-shell" onDragOver={(event) => {
    if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); }
  }} onDragLeave={(event) => {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
  }}
    onDrop={(event) => {
      event.preventDefault(); setDragging(false);
      const file = event.dataTransfer.files[0];
      if (event.dataTransfer.files.length !== 1) workbench.setError('Open one structure file at a time.');
      else if (file) void workbench.loadFile(file);
    }}>
    <a className="skip-link" href="#workbench">Skip to protein workspace</a>
    <header className="app-header">
      <div className="brand"><span className="brand-symbol" aria-hidden="true">b</span><span>Bio<span className="brand-light">Tool</span></span>
        <span className="brand-description">Protein explorer</span></div>
      <button className="search-trigger" aria-label="Find a structure" onClick={() => setSearchOpen(true)}><Icon name="search" />
        <span>Find a structure</span><kbd>⌘ K</kbd></button>
      <div className="header-actions"><span className="local-first"><i aria-hidden="true" /> Local-first</span>
        <button className="icon-button theme-toggle" onClick={() => setAppearance(appearance === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${appearance === 'dark' ? 'light' : 'dark'} mode`}>
          <span className="theme-glyph" data-active={appearance === 'dark'} aria-hidden="true"><Icon name="sun" /></span>
          <span className="theme-glyph" data-active={appearance === 'light'} aria-hidden="true"><Icon name="moon" /></span>
        </button>
        <button className="icon-button library-toggle" onClick={() => setLibraryOpen(!libraryOpen)} aria-label="Toggle protein library"
          aria-expanded={libraryOpen} aria-controls="library-panel"><Icon name="folder" /></button></div>
    </header>
    <div className="app-body">
      <LibraryPanel saved={workbench.saved} currentId={workbench.workspace?.source.id} open={libraryOpen}
        onLoad={(id) => { void workbench.loadPublic(id); setLibraryOpen(false); }}
        onLoadSaved={(source) => { void workbench.loadSaved(source); setLibraryOpen(false); }}
        onRemove={(id) => void remove(id)} onClear={() => void remove()} onImport={() => input.current?.click()} />
      <div className="workspace-container">
        {workbench.busy && <div className="load-status" role="status"><span className="loading-line" />{workbench.status}
          <button className="text-button" onClick={workbench.cancel}>Cancel</button></div>}
        {workbench.error && <div className="error-banner" role="alert"><Icon name="info" /><span>{workbench.error}
          {workbench.retryId && <button className="text-button" disabled={workbench.busy}
            onClick={() => { if (workbench.retryId) void workbench.loadPublic(workbench.retryId, true); }}>Refresh {workbench.retryId} from RCSB</button>}
          <button className="text-button" disabled={workbench.busy} onClick={() => void remove()}>Clear saved files</button></span>
          <button className="icon-button" aria-label="Dismiss error" onClick={() => workbench.setError(null)}><Icon name="close" /></button></div>}
        <ErrorBoundary resetKeys={[workbench.workspace?.source.digest]} fallbackRender={({ resetErrorBoundary }) =>
          <div className="workspace-empty" role="alert"><h1>The workspace could not render</h1>
            <p>Your saved files are unchanged.</p><button className="button" onClick={resetErrorBoundary}>Try again</button></div>}>
          {workbench.workspace ? <Workbench key={`${workbench.workspace.source.id}:${workbench.workspace.source.digest ?? workbench.workspace.source.fetchedAt}`}
            workspace={workbench.workspace} appearance={appearance} onError={workbench.setError} busy={workbench.busy}
            onRefresh={() => { if (workbench.workspace) void workbench.loadPublic(workbench.workspace.source.id, true); }} />
            : <main className="workspace-empty" id="workbench"><span className="empty-orbit" aria-hidden="true" />
              <h1>{workbench.busy ? 'Opening structure' : 'Start with a structure.'}</h1>
              <p>{workbench.busy ? workbench.status : 'Choose a protein from the collection or open your own coordinate file.'}</p>
              {!workbench.busy && <button className="button" onClick={() => setSearchOpen(true)}>Find a structure</button>}</main>}
        </ErrorBoundary>
        <footer className="app-footer"><span><i className={offline.state === 'ready' ? 'status-dot ready' : 'status-dot'} aria-hidden="true" />
          {!offline.online ? 'Offline' : offline.state === 'ready' ? 'Ready for offline use' : offline.state === 'preparing' ? 'Preparing offline access' : 'Offline app cache unavailable'}
        </span><span>Observed residues. Open questions.</span>{import.meta.env.PROD &&
          <a href={`${import.meta.env.BASE_URL}third-party-licenses.txt`} target="_blank" rel="noreferrer">Open-source credits</a>}
          <a href="https://molstar.org/" target="_blank" rel="noreferrer">Rendered with Mol*</a></footer>
      </div>
    </div>
    <input ref={input} className="file-input" type="file" accept=".pdb,.cif,.mmcif,.bcif,.pdb.gz,.cif.gz,.mmcif.gz,.bcif.gz"
      aria-label="Open local structure file" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void workbench.loadFile(file);
        event.target.value = '';
      }} />
    <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} onLoad={(id) => void workbench.loadPublic(id)} />
    {dragging && <div className="drop-overlay"><Icon name="upload" size={32} /><strong>Drop a structure to explore</strong><span>PDB · mmCIF · BinaryCIF · up to 20 MB</span></div>}
  </div>;
}
