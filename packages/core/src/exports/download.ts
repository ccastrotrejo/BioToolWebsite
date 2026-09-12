import type { Analysis, Chain, Protein, SourceFile, TripletClass } from '../domain/types';
import { ANALYSIS_VERSION, GROUP_LABELS, TRIPLET_LABELS } from '../analysis/constants';
import { REPORT_SCRIPT, REPORT_STYLE } from './reportRuntime';

type ReportKind = 'overview' | 'triplets';
const classes: TripletClass[] = ['alpha', 'beta', 'turn', 'random'];
const escapeHtml = (value: unknown): string => String(value).replace(/[&<>"']/g, (character) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const oneLine = (value: string): string => value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ');
const filename = (value: string): string =>
  value.replace(/[\u0000-\u001f\u007f-\u009f/\\:*?"<>|]/g, '_').replace(/^\.+/, '_').trim() || 'biotool';
const inlineJson = (value: unknown): string => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) =>
  `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
const chainLabel = (chain: Chain): string =>
  `${chain.label || '(no identifier)'} (author ${chain.authId || 'blank'}, label ${chain.labelId || 'blank'}, key ${chain.key})`;

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename(name);
  anchor.hidden = true;
  try {
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Keep the URL alive until the browser has started consuming the click's download.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Downloads unchanged source content; imported gzip sources already carry their decoded filename. */
export function downloadSource(source: SourceFile): void {
  const data = typeof source.data === 'string' ? source.data : new Uint8Array(source.data);
  saveBlob(new Blob([data], { type: source.format === 'bcif' ? 'application/octet-stream' : 'text/plain;charset=utf-8' }), source.filename);
}

function fastaForChains(source: SourceFile, protein: Protein, chains: Chain[]): string {
  return chains.map((chain) => {
    const header = `>${oneLine(source.id)}|chain ${oneLine(chainLabel(chain))}|model ${oneLine(protein.modelNumber)}|observed CA sequence`;
    const lines = Array.from({ length: Math.ceil(chain.sequence.length / 80) }, (_, index) => chain.sequence.slice(index * 80, (index + 1) * 80));
    return [header, ...lines].join('\n') + '\n';
  }).join('');
}

/** Creates one 80-column observed-CA FASTA record per selected chain, including unscored tails. */
export function createFasta(source: SourceFile, protein: Protein, chainKey: string | null = null): string {
  const chains = chainKey === null ? protein.chains : protein.chains.filter((chain) => chain.key === chainKey);
  if (chainKey !== null && !chains.length) throw new Error(`Unknown FASTA chain: ${chainKey}`);
  return fastaForChains(source, protein, chains);
}

/** Downloads observed sequences, not a completed biological sequence or a triplet-only sequence. */
export function downloadFasta(source: SourceFile, protein: Protein, chainKey: string | null = null): void {
  saveBlob(new Blob([createFasta(source, protein, chainKey)], { type: 'text/plain;charset=utf-8' }),
    `${source.id}${chainKey === null ? '' : `-chain-${chainKey}`}.fasta`);
}

function scopeChains(protein: Protein, analysis: Analysis): { chains: Chain[]; all: boolean } {
  const selected = new Set(analysis.chainKeys);
  const chains = protein.chains.filter((chain) => selected.has(chain.key));
  if (chains.length !== selected.size || chains.length !== analysis.chainCount) {
    throw new Error('The supplied analysis scope does not match this protein; no report was exported.');
  }
  return { chains, all: chains.length === protein.chains.length };
}

function table(caption: string, headings: string[], rows: string): string {
  return `<div class="scroll" tabindex="0" role="region" aria-label="${escapeHtml(caption)}"><table><caption>${escapeHtml(caption)}</caption><thead><tr>${headings.map((heading) =>
    `<th scope="col">${escapeHtml(heading)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** Builds a deterministic, standalone offline report from the supplied analysis and source provenance. */
export function createReportHtml(source: SourceFile, protein: Protein, analysis: Analysis, kind: ReportKind): string {
  const { chains, all } = scopeChains(protein, analysis);
  const scope = `${all ? 'All chains' : chains.length === 1 ? 'Chain' : 'Chains'}: ${chains.map(chainLabel).join('; ') || '(none)'}`;
  const atomIndices = new Set(chains.flatMap((chain) => chain.residues.flatMap((residue) => residue.atomIndices)));
  // An all-source analysis additionally counts accepted atoms in residues without a CA.
  const sourceAtomsIncluded = all && analysis.atomCount === protein.atoms.length;
  const atoms = sourceAtomsIncluded ? protein.atoms : protein.atoms.filter((_, index) => atomIndices.has(index));
  if (atoms.length !== analysis.atomCount) throw new Error('The supplied analysis atom count does not match its explicit chain scope.');
  const points = atoms.map((atom) => atom.position).filter((point) => point.length === 3 && point.every(Number.isFinite));
  const title = kind === 'overview' ? 'Composition and atomic coordinates' : 'Legacy triplet propensity';
  const compositionRows = analysis.composition.map((entry) => `<tr><th scope="row">${escapeHtml(entry.code)} · ${escapeHtml(entry.name)}</th>
    <td>${escapeHtml(GROUP_LABELS[entry.group])}</td><td>${entry.count}</td><td>${entry.percent.toFixed(2)}%</td>
    <td><span class="track" aria-hidden="true"><span class="bar" style="width:${Math.max(0, Math.min(100, entry.percent))}%"></span></span></td></tr>`).join('');
  const tripletRows = classes.map((category) => `<tr><th scope="row">${escapeHtml(TRIPLET_LABELS[category])} propensity</th><td>${analysis.tripletCounts[category]}</td></tr>`).join('');
  const labels = new Map(chains.map((chain) => [chain.key, chainLabel(chain)]));
  const residues = new Map(chains.flatMap((chain) => chain.residues.map((residue) => [residue.key, residue] as const)));
  const instances = ['Instance ID\tChain\tAuthor residue positions\tResidue keys\tSequence\tAlpha score\tBeta score\tTurn score\tLegacy propensity class',
    ...analysis.triplets.map((triplet) => [
      triplet.id, labels.get(triplet.chainKey) ?? triplet.chainKey,
      triplet.residueKeys.map((key) => { const residue = residues.get(key); return residue ? residue.authSeq + residue.insertion : key; }).join(', '),
      triplet.residueKeys.join(', '), triplet.sequence, ...triplet.scores.map((score) => score.toFixed(4)), TRIPLET_LABELS[triplet.classification],
    ].map((value) => oneLine(String(value))).join('\t'))].join('\n');
  const provenance = [
    ['Source identifier', source.id], ['Filename', source.filename], ['Format', source.format],
    ['Origin', source.origin], ['Source URL (text only)', source.sourceUrl ?? 'Not supplied'],
    ['Source SHA-256', source.digest ?? 'Not available; not computed in this report'],
    ['Source retrieved/imported at', source.fetchedAt], ['Coordinate model', protein.modelNumber],
    ['Analysis version', ANALYSIS_VERSION], ['Analysis scope', scope],
  ].map(([key, value]) => `<tr><th scope="row">${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`).join('');
  let coordinateView = '';
  if (kind === 'overview') {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const point of points) for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, point[axis]!); max[axis] = Math.max(max[axis]!, point[axis]!);
    }
    const extents = ['X', 'Y', 'Z'].map((axis, index) => `<tr><th scope="row">${axis}</th><td>${points.length ? min[index]!.toFixed(3) : 'N/A'}</td><td>${points.length ? max[index]!.toFixed(3) : 'N/A'}</td></tr>`).join('');
    coordinateView = `<section aria-labelledby="coordinates-heading"><h2 id="coordinates-heading">Unbonded atomic coordinates</h2>
      <p>${escapeHtml(scope)}. ${points.length} finite coordinates of ${atoms.length} accepted atoms, including non-CA atoms.
      ${sourceAtomsIncluded ? 'All accepted atoms in the selected model are included.' : 'All accepted atoms attached to observed CA residues in this chain scope are included.'}
      ${atoms.length - points.length} non-finite coordinates omitted.</p>
      <p>Orthographic projection of supplied coordinates in ångströms (Å). Points are atoms, not bonds, ribbons, or a simulated fold.</p>
      <p id="plot-help">Drag to rotate; scroll to zoom. Focus the plot and use arrow keys to rotate, +/− to zoom, and R, 0 or Home to reset. Buttons provide the same controls.</p>
      <div class="controls" role="group" aria-label="Coordinate view controls">${[['left', 'Rotate left'], ['right', 'Rotate right'], ['up', 'Rotate up'], ['down', 'Rotate down'], ['in', 'Zoom in'], ['out', 'Zoom out'], ['reset', 'Reset view']]
        .map(([action, label]) => `<button type="button" disabled data-view="${action}">${label}</button>`).join('')}</div>
      <canvas id="atom-plot" width="900" height="480" tabindex="0" role="img" aria-label="Unbonded atomic coordinate plot" aria-describedby="plot-help">Coordinate summary is available below.</canvas>
      <p id="plot-status" role="status">Interactive view requires JavaScript and canvas. The coordinate summary below is always available.</p>
      ${table(`Coordinate summary · ${scope} · ${points.length} atoms`, ['Axis', 'Minimum (Å)', 'Maximum (Å)'], extents)}</section>
      <script type="application/json" id="atom-coordinates">${inlineJson({ points, scope })}</script>`;
  }
  return `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; connect-src 'none'">
    <title>${escapeHtml(source.id)} · ${escapeHtml(title)} | BioTool</title><style>${REPORT_STYLE}</style></head><body><main>
    <header><div class="toolbar"><span class="brand">BIOTOOL / OFFLINE REPORT</span><label for="appearance">Appearance <select id="appearance" disabled><option value="light">Light</option><option value="dark">Dark</option></select></label><button id="print-report" type="button" disabled>Print report</button></div>
    <h1>${escapeHtml(title)}</h1><p>${escapeHtml(protein.title)}</p><p class="scope">${escapeHtml(scope)}</p></header>
    <noscript><p>Tables, sequences, provenance, and expandable data work without scripts. Plot interaction and appearance controls need JavaScript; use your browser's Print command.</p></noscript>
    <section><h2>Analysis summary</h2><p>${analysis.residueCount} observed CA residues · ${analysis.chainCount} chains · ${analysis.atomCount} accepted atoms · ${analysis.triplets.length} complete triplets · ${analysis.tailCount} unscored trailing residues.</p>
    <p>Observed residues in coordinate model ${escapeHtml(protein.modelNumber)} only; not necessarily the complete biological sequence. MSE is counted as methionine. Other HETATM residues are excluded from amino-acid counts.</p>
    ${protein.warnings.length ? `<h3>Source and parser caveats (whole source)</h3><ul>${protein.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}</section>
    <section><h2>Amino-acid composition</h2>${table(`Observed CA residues · ${scope}`, ['Amino acid', 'Group', 'Count', 'Percentage', 'Composition bar'], compositionRows)}</section>
    ${coordinateView}
    <section><h2>Legacy triplet propensity — not structural assignment</h2>
    <p>This sequence heuristic is neither an experimental structural assignment nor a validated folding prediction. Alpha, Beta, Beta turn, and Random are legacy propensity labels, not measured secondary structure.</p>
    <p>Triplets are non-overlapping within each chain, never cross chain boundaries, and retain every repeated occurrence. ${analysis.tailCount} trailing residues (one or two per incomplete chain) are unscored, but remain in composition and FASTA. Only observed CA residues participate: missing residues are not inserted, so a triplet can span numbering gaps or unresolved coordinates.</p>
    <p>Scores are arithmetic means of the three fixed amino-acid propensities, rounded to four decimals. Apply these strict thresholds in order:</p>
    <ol><li>Alpha: alpha &gt; 1.1, beta &lt; 1.2, turn &lt; 1.3.</li><li>Otherwise Beta: alpha &lt; 1.1, beta &gt; 1, turn &lt; 1.3.</li><li>Otherwise Beta turn: alpha &lt; 1.25, beta &lt; 1, turn &gt; 1.15.</li><li>Otherwise Random.</li></ol>
    ${table(`All ${analysis.triplets.length} complete triplet instances · ${scope}`, ['Legacy propensity class', 'Count'], tripletRows)}
    ${analysis.triplets.length ? `<details><summary>All triplet instances (${analysis.triplets.length}; tab-separated data)</summary><pre id="triplet-instances" tabindex="0" aria-label="All triplet instances, tab-separated">${escapeHtml(instances)}</pre></details>` : '<p>No complete triplets in this scope.</p>'}</section>
    <section><h2>Observed FASTA by chain</h2><p>${escapeHtml(scope)}. Includes unscored tails; lines wrap at 80 residues.</p><pre id="fasta" tabindex="0" aria-label="Observed FASTA sequence">${escapeHtml(fastaForChains(source, protein, chains)) || 'No observed sequence.'}</pre></section>
    <section><h2>Provenance</h2>${table('Source and analysis provenance', ['Field', 'Value'], provenance)}</section>
    <footer>Self-contained BioTool report. No network requests, external libraries, remote images, telemetry, or executable source links. All scientific statistics are from the supplied analysis scope.</footer>
    </main><script>${REPORT_SCRIPT}</script></body></html>`;
}

/** Downloads an interactive, self-contained HTML report rather than a hosted URL or screenshot. */
export function downloadReport(source: SourceFile, protein: Protein, analysis: Analysis, kind: ReportKind): void {
  saveBlob(new Blob([createReportHtml(source, protein, analysis, kind)], { type: 'text/html;charset=utf-8' }), `${source.id}-${kind}.html`);
}
