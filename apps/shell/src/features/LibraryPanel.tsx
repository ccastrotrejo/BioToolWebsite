import { CATALOG } from '../data/catalog';
import type { SavedStructure } from '../data/library';
import type { SourceFile } from '@biotool/core/domain/types';
import { Icon } from '../ui/Icon';

interface LibraryPanelProps {
  saved: SavedStructure[];
  currentId?: string;
  open: boolean;
  onLoad: (id: string) => void;
  onLoadSaved: (source: SourceFile) => void;
  onRemove: (id: string) => void;
  onImport: () => void;
  onClear: () => void;
  notice: ReactNode;
}

export function LibraryPanel({ saved, currentId, open, onLoad, onLoadSaved, onRemove, onImport, onClear, notice }: LibraryPanelProps) {
  const savedIds = new Set(saved.map((item) => item.source.id));
  const additional = saved.filter((item) => !CATALOG.some((entry) => entry.id === item.source.id));
  return <aside className="library-panel" id="library-panel" data-open={open} data-framework="react-recovery" aria-labelledby="library-heading" tabIndex={0}>
    <div className="library-heading"><h2 id="library-heading">Library</h2><span className="count-label">{saved.length} saved</span></div>
    {notice}
    <p className="library-intro">A few small structures.<br />A lot to discover.</p>
    <h3 className="small-heading">The collection</h3>
    <ul className="library-list">{CATALOG.map((item) => <li key={item.id}>
      <button className="library-item" aria-current={currentId === item.id ? 'true' : undefined}
        onClick={() => onLoad(item.id)}>
        <span className="accession">{item.id}</span>
        <span className="library-item-name">{item.name}<small>{item.topic}</small></span>
        <span className={`availability ${savedIds.has(item.id) ? 'is-saved' : ''}`}
          aria-label={savedIds.has(item.id) ? 'Saved on this device' : item.id === '1CRN' ? 'Bundled example' : 'Not downloaded'} />
      </button>
    </li>)}</ul>
    {additional.length > 0 && <><h3 className="small-heading">Your structures</h3>
      <ul className="library-list saved-list">{additional.map(({ source, residueCount }) => <li key={source.id}>
        <button className="library-item" aria-current={currentId === source.id ? 'true' : undefined} onClick={() => onLoadSaved(source)}>
          <Icon name="folder" /><span className="library-item-name">{source.origin === 'local' ? source.filename : source.id}
            <small>{residueCount.toLocaleString()} observed residues</small></span>
        </button>
        <button className="icon-button" onClick={() => onRemove(source.id)} aria-label={`Remove ${source.filename} from device library`}><Icon name="trash" size={15} /></button>
      </li>)}</ul></>}
    <button className="button import-button" onClick={onImport}><Icon name="upload" /> Open a local file</button>
    <p className="file-hint">PDB, mmCIF, BinaryCIF<br />Local files stay on this device.</p>
    <div className="library-footer"><p>Saved structures work offline once the app is ready for offline use.</p>
      <button className="text-button" onClick={onClear}>Clear saved files</button>
      <a href="https://www.rcsb.org/" target="_blank" rel="noreferrer">RCSB Protein Data Bank <span aria-hidden="true">↗</span></a>
    </div>
  </aside>;
}
import type { ReactNode } from 'react';
