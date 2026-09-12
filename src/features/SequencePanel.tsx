import { useEffect, useMemo, useRef, useState } from 'react';
import type { Analysis, Protein } from '../domain/types';
import { TRIPLET_LABELS } from '../analysis/constants';
import { Icon } from '../ui/Icon';

interface SequencePanelProps {
  protein: Protein;
  analysis: Analysis;
  chainKey: string | null;
  selection: readonly string[];
  onSelect: (keys: string[]) => void;
  onHover: (key: string | null) => void;
  onFasta: () => void;
}
const PAGE_SIZE = 60;

export function SequencePanel({ protein, analysis, chainKey, selection, onSelect, onHover, onFasta }: SequencePanelProps) {
  const [viewChain, setViewChain] = useState(protein.chains[0]?.key ?? '');
  const [page, setPage] = useState(0);
  const [cursor, setCursor] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const available = chainKey === null ? protein.chains : protein.chains.filter((chain) => chain.key === chainKey);
  const chain = available.find((item) => item.key === viewChain) ?? available[0];
  const pages = Math.ceil((chain?.residues.length ?? 0) / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  const start = currentPage * PAGE_SIZE;
  const visible = chain?.residues.slice(start, start + PAGE_SIZE) ?? [];
  const selected = useMemo(() => new Set(selection), [selection]);
  const categories = useMemo(() => new Map(analysis.triplets.flatMap((triplet) =>
    triplet.residueKeys.map((key) => [key, triplet.classification] as const))), [analysis]);

  useEffect(() => {
    const first = protein.residues.find((residue) => residue.key === selection[0]);
    const selectedChain = protein.chains.find((item) => item.key === first?.chainKey);
    const index = selectedChain?.residues.findIndex((residue) => residue.key === first?.key) ?? -1;
    if (first && index >= 0) { setViewChain(first.chainKey); setPage(Math.floor(index / PAGE_SIZE)); setCursor(index); }
  }, [selection, protein]);

  function move(next: number) {
    if (!chain) return;
    const index = Math.max(0, Math.min(chain.residues.length - 1, next));
    setPage(Math.floor(index / PAGE_SIZE));
    setCursor(index);
    requestAnimationFrame(() => container.current?.querySelector<HTMLButtonElement>(`[data-index="${index}"]`)?.focus({ preventScroll: true }));
  }
  return <section className="sequence-panel" aria-labelledby="sequence-heading">
    <div className="sequence-heading"><div><h2 id="sequence-heading">The observed sequence</h2>
      <p>Every letter connects to the molecule. Positions follow the observed sequence.</p></div>
      <button className="button" onClick={onFasta}><Icon name="download" size={15} /> FASTA</button></div>
    <div className="sequence-toolbar"><label>Sequence chain
      <select value={chain?.key ?? ''} onChange={(event) => { setViewChain(event.target.value); setPage(0); setCursor(0); }}>
        {available.map((item) => <option key={item.key} value={item.key}>{item.label} · {item.residues.length} residues</option>)}
      </select></label><span className="sequence-hint">Arrow keys navigate · Enter selects</span></div>
    <div ref={container} className="sequence-grid" role="group" aria-label={`Observed sequence for chain ${chain?.label ?? ''}`}>
      {visible.map((residue, index) => {
        const observedIndex = start + index;
        const category = categories.get(residue.key);
        const position = residue.authSeq + residue.insertion;
        return <button key={residue.key} className="sequence-residue" data-static="true" data-index={start + index} data-category={category ?? 'unscored'}
          aria-pressed={selected.has(residue.key)}
          aria-label={`${residue.name}, chain ${residue.authChain.trim() || 'unnamed'}, author position ${position}, observed position ${observedIndex + 1}. ${category ? TRIPLET_LABELS[category] + ' propensity' : 'Unscored'}.`}
          title={`${residue.name} · chain ${residue.authChain.trim() || '(unnamed)'} · author ${position}`}
          tabIndex={cursor >= start && cursor < start + visible.length ? (cursor === start + index ? 0 : -1) : index === 0 ? 0 : -1}
          onClick={() => { setCursor(observedIndex); onSelect([residue.key]); }}
          onMouseEnter={() => onHover(residue.key)} onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(residue.key)} onBlur={() => onHover(null)}
          onKeyDown={(event) => {
            let next: number | undefined;
            if (event.key === 'ArrowRight') next = observedIndex + 1;
            if (event.key === 'ArrowLeft') next = observedIndex - 1;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = (chain?.residues.length ?? 1) - 1;
            if (next !== undefined) { event.preventDefault(); move(next); }
          }}><span>{residue.aminoAcid}</span><small>{observedIndex + 1}</small></button>;
      })}
    </div>
    <div className="sequence-footer"><span>{start + 1}–{start + visible.length} of {chain?.residues.length ?? 0} residues</span>
      {pages > 1 && <div className="pagination"><button className="icon-button" aria-label="Previous sequence page" disabled={currentPage === 0}
        onClick={() => { setPage(currentPage - 1); setCursor((currentPage - 1) * PAGE_SIZE); }}><Icon name="left" /></button>
        <span>{currentPage + 1} / {pages}</span>
        <button className="icon-button" aria-label="Next sequence page" disabled={currentPage + 1 >= pages}
          onClick={() => { setPage(currentPage + 1); setCursor((currentPage + 1) * PAGE_SIZE); }}><Icon name="right" /></button></div>}
      <span>CA-observed · first model · gaps may be omitted</span></div>
  </section>;
}
