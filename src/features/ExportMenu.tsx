import { Icon } from '../ui/Icon';

interface ExportMenuProps {
  onSource: () => void;
  onFasta: () => void;
  onReport: (kind: 'overview' | 'triplets') => void;
  onShare: () => void;
  canShare: boolean;
}

export function ExportMenu({ onSource, onFasta, onReport, onShare, canShare }: ExportMenuProps) {
  return <details className="export-menu" onKeyDown={(event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
    }
  }}>
    <summary className="button"><Icon name="download" size={16} /> Export <Icon name="chevron" size={14} /></summary>
    <div className="export-options">
      <button onClick={onSource}>Original coordinates</button>
      <button onClick={onFasta}>Observed FASTA</button>
      <button onClick={() => onReport('overview')}>Overview HTML</button>
      <button onClick={() => onReport('triplets')}>Triplet HTML</button>
      <button onClick={onShare} disabled={!canShare}>Copy structure link</button>
      <p>HTML reports are self-contained.<br />Local files are never shared by URL.</p>
    </div>
  </details>;
}
