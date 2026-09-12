import { useEffect, useRef, useState } from 'react';
import { CATALOG } from '../data/catalog';
import { normalizeAccession, errorMessage } from '../data/source';
import { Icon } from '../ui/Icon';

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
  onLoad: (id: string) => void;
  recoveryMessage?: string;
}

export function SearchDialog({ open, onClose, onLoad, recoveryMessage }: SearchDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const matches = CATALOG.filter((item) => `${item.id} ${item.name} ${item.topic}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      input.current?.focus();
    } else dialog.current?.close();
  }, [open]);
  function choose(id: string) { onLoad(id); onClose(); setQuery(''); setError(null); }
  return <dialog ref={dialog} className="search-dialog" data-framework="react-recovery" onCancel={onClose} onClose={onClose} aria-labelledby="search-title"
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }}>
    <div className="dialog-heading"><h2 id="search-title">Open a structure</h2>
      <button className="icon-button" onClick={onClose} aria-label="Close structure search"><Icon name="close" /></button></div>
    {recoveryMessage && <p className="library-recovery" role="alert">Library recovery mode. The Vue module could not run: {recoveryMessage}. Basic search remains available.</p>}
    <form onSubmit={(event) => {
      event.preventDefault();
      try { choose(matches.length === 1 ? matches[0]!.id : normalizeAccession(query)); }
      catch (cause) { setError(errorMessage(cause)); }
    }}>
      <label htmlFor="accession">PDB identifier or example name</label>
      <div className="search-field"><Icon name="search" /><input ref={input} id="accession" value={query}
        onChange={(event) => { setQuery(event.target.value); setError(null); }}
        placeholder="1CRN, ubiquitin, pdb_00001crn" autoComplete="off" spellCheck={false}
        aria-invalid={Boolean(error)} aria-describedby="accession-help" /></div>
      <p id="accession-help" className={error ? 'error-text' : 'muted'} role={error ? 'alert' : undefined}>
        {error ?? 'Public coordinates come from RCSB. A saved copy is used first.'}</p>
      <button className="button primary" type="submit">Open structure <Icon name="right" /></button>
    </form>
    <h3 className="dialog-subheading">Explore the collection</h3>
    <ul className="search-results">{matches.map((item) => <li key={item.id}>
      <button onClick={() => choose(item.id)}>
        <span className="accession">{item.id}</span><span>{item.name}<small>{item.topic}</small></span><Icon name="right" />
      </button>
    </li>)}</ul>
    {matches.length === 0 && <p className="muted">No matching examples. Enter a PDB identifier to load from RCSB.</p>}
  </dialog>;
}
