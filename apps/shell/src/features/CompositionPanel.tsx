import { useState } from 'react';
import type { Analysis, Protein } from '@biotool/core/domain/types';
import { GROUP_LABELS } from '@biotool/core/analysis/constants';

interface CompositionPanelProps {
  analysis: Analysis;
  protein: Protein;
  chainKey: string | null;
  onSelect: (keys: string[]) => void;
}

export function CompositionPanel({ analysis, protein, chainKey, onSelect }: CompositionPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const ranked = [...analysis.composition].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  const max = Math.max(1, ...ranked.map((entry) => entry.count));
  return <section aria-labelledby="composition-heading">
    <div className="section-heading"><h2 id="composition-heading">Amino acid composition</h2>
      <p>Of {analysis.residueCount.toLocaleString()} observed residues</p></div>
    <div className="composition-chart" aria-label="Select an amino acid to highlight its residues">
      {(expanded ? ranked : ranked.slice(0, 8)).map((entry) => <button key={entry.code}
        className="composition-row" data-group={entry.group} disabled={entry.count === 0}
        onClick={() => onSelect(protein.residues.filter((residue) =>
          residue.aminoAcid === entry.code && (chainKey === null || residue.chainKey === chainKey)).map((residue) => residue.key))}
        aria-label={`${entry.name}: ${entry.count} residues, ${entry.percent.toFixed(1)} percent. Highlight residues.`}>
        <span className="residue-abbr">{entry.three}</span>
        <span className="composition-track"><span style={{ width: `${entry.count / max * 100}%` }} /></span>
        <span className="composition-value">{entry.percent.toFixed(1)}<small>%</small></span>
      </button>)}
    </div>
    <button className="text-button show-all" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
      {expanded ? 'Show most abundant' : 'Show all 20 amino acids'}
    </button>
    <div className="group-legend">{Object.entries(GROUP_LABELS).map(([group, label]) =>
      <span key={group} data-group={group}><i aria-hidden="true" />{label}</span>)}</div>
    <details className="data-details"><summary>Composition table</summary>
      <table><caption>Observed amino acids</caption><thead><tr><th scope="col">Amino acid</th><th scope="col">Count</th><th scope="col">%</th></tr></thead>
        <tbody>{ranked.map((entry) => <tr key={entry.code}><th scope="row">{entry.name}</th><td>{entry.count}</td><td>{entry.percent.toFixed(1)}</td></tr>)}</tbody></table>
    </details>
  </section>;
}
