import type { Analysis, Protein } from '@biotool/core/domain/types';
import { AMINO_ACIDS, TRIPLET_LABELS } from '@biotool/core/analysis/constants';

interface SelectionInspectorProps {
  protein: Protein;
  analysis: Analysis;
  selection: readonly string[];
  hoverKey: string | null;
  onClear: () => void;
  onFocus: () => void;
  canFocus: boolean;
}

export function SelectionInspector({ protein, analysis, selection, hoverKey, onClear, onFocus, canFocus }: SelectionInspectorProps) {
  const residue = protein.residues.find((item) => item.key === (hoverKey ?? selection[0]));
  const amino = AMINO_ACIDS.find((item) => item.code === residue?.aminoAcid);
  const triplet = analysis.triplets.find((item) =>
    selection.length === 3 && item.residueKeys.every((key) => selection.includes(key)));
  return <section className="selection-inspector" aria-labelledby="selection-heading">
    <div className="selection-heading"><h2 id="selection-heading">{hoverKey ? 'Under your cursor' : 'Selection'}</h2>
      {selection.length > 0 && <button className="text-button" onClick={onClear}>Clear</button>}</div>
    {residue ? <>
      <p className="selection-name"><strong>{hoverKey || selection.length === 1 ? amino?.name : `${selection.length} residues`}</strong>
        <code>{hoverKey || selection.length === 1 ? `${residue.name} ${residue.authSeq}${residue.insertion}` : triplet?.sequence}</code></p>
      <p className="muted">Chain {residue.authChain.trim() || '(unnamed)'} · model {protein.modelNumber}
        {residue.labelChain !== residue.authChain ? ` · label chain ${residue.labelChain}` : ''}</p>
      {triplet && <><div className="score-grid">{['Alpha', 'Beta', 'Turn'].map((label, index) =>
        <div key={label}><span>{label}</span><strong>{triplet.scores[index]?.toFixed(4)}</strong></div>)}</div>
        <p className="muted">Heuristic: {TRIPLET_LABELS[triplet.classification]}</p></>}
      <button className="button focus-selection" onClick={onFocus} disabled={!canFocus || selection.length === 0}>Focus selection</button>
    </> : <p className="selection-empty">Select a residue in the sequence, click the molecule, or choose a chart bar to connect the views.</p>}
  </section>;
}
