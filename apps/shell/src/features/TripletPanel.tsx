import { useMemo, useState } from 'react';
import type { Analysis, Protein, TripletClass } from '@biotool/core/domain/types';
import { TRIPLET_LABELS } from '@biotool/core/analysis/constants';
import { Icon } from '../ui/Icon';

interface TripletPanelProps { analysis: Analysis; protein: Protein; onSelect: (keys: string[]) => void }
const classes: TripletClass[] = ['alpha', 'beta', 'turn', 'random'];
const circumference = 2 * Math.PI * 42;
const PAGE_SIZE = 40;

export function TripletPanel({ analysis, protein, onSelect }: TripletPanelProps) {
  const [page, setPage] = useState(0);
  const total = analysis.triplets.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  const positions = useMemo(() => new Map(protein.chains.flatMap((chain) =>
    chain.residues.map((residue, index) => [residue.key, { chain: chain.label, position: index + 1 }] as const))), [protein]);
  let offset = 0;
  return <section aria-labelledby="triplet-heading">
    <div className="section-heading"><h2 id="triplet-heading">Triplet propensity</h2><p>A sequence heuristic, not a prediction.</p></div>
    {total > 0 ? <div className="triplet-summary">
      <svg viewBox="0 0 120 120" className="triplet-ring" role="img" aria-label={`${total} complete triplets`}>
        <circle cx="60" cy="60" r="42" className="ring-track" />
        {classes.map((category) => {
          const size = analysis.tripletCounts[category] / total * circumference;
          const start = offset;
          offset += size;
          return <circle key={category} cx="60" cy="60" r="42" data-category={category}
            strokeDasharray={`${size} ${circumference - size}`} strokeDashoffset={-start} transform="rotate(-90 60 60)" />;
        })}
        <text x="60" y="59" className="ring-count">{total}</text><text x="60" y="75" className="ring-label">triplets</text>
      </svg>
      <div className="triplet-legend">{classes.map((category) => <button key={category} data-category={category}
        aria-label={`${TRIPLET_LABELS[category]}: ${analysis.tripletCounts[category]} triplets. Highlight residues.`}
        disabled={analysis.tripletCounts[category] === 0}
        onClick={() => onSelect(analysis.triplets.filter((triplet) => triplet.classification === category).flatMap((triplet) => triplet.residueKeys))}>
        <i aria-hidden="true" /><span>{TRIPLET_LABELS[category]}</span><strong>{analysis.tripletCounts[category]}</strong>
      </button>)}</div>
    </div> : <p className="empty-inline">No complete triplets in this chain scope.</p>}
    <p className="analysis-caveat">{analysis.tailCount} trailing residues are unscored. They still count toward composition.</p>
    <details className="data-details" open><summary>Inspect a triplet</summary>
      <div className="triplet-list">{analysis.triplets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((triplet) => {
        const first = positions.get(triplet.residueKeys[0])!;
        const last = positions.get(triplet.residueKeys[2])!;
        return <button key={triplet.id} className="triplet-row" data-category={triplet.classification}
          aria-label={`${triplet.sequence}, ${TRIPLET_LABELS[triplet.classification]}, chain ${first.chain}, observed positions ${first.position} to ${last.position}`}
          onClick={() => onSelect(triplet.residueKeys)}>
          <code>{triplet.sequence}</code><span>{TRIPLET_LABELS[triplet.classification]}</span>
          <small>{first.chain} / {first.position}–{last.position}</small>
        </button>;
      })}</div>
      {pages > 1 && <div className="pagination"><button className="icon-button" aria-label="Previous triplet page" disabled={page === 0}
        onClick={() => setPage(page - 1)}><Icon name="left" /></button><span>{page + 1} / {pages}</span>
        <button className="icon-button" aria-label="Next triplet page" disabled={page + 1 >= pages}
          onClick={() => setPage(page + 1)}><Icon name="right" /></button></div>}
    </details>
    <details className="data-details"><summary>How this is calculated</summary>
      <p>Three fixed propensity scores are averaged over each non-overlapping triplet, then classified using BioTool's original thresholds. Triplets never cross chains.</p>
      <p>Only observed residues are included, so a triplet can span a gap in resolved coordinates. Ribbon shape comes from structural data, not this heuristic.</p>
    </details>
  </section>;
}
