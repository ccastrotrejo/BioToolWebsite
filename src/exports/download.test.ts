import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AminoAcid, Protein, Residue, SourceFile } from '../domain/types';
import { analyzeProtein } from '../analysis/analyze';
import { ANALYSIS_VERSION, AMINO_ACIDS } from '../analysis/constants';
import { createFasta, createReportHtml, downloadFasta, downloadReport, downloadSource } from './download';

const source: SourceFile = {
  id: '1CRN', filename: '1CRN.cif', data: 'data_1CRN\r\n# original\r\n',
  format: 'mmcif', origin: 'local', fetchedAt: '2026-09-12T12:00:00Z',
  sourceUrl: 'https://example.invalid/1CRN.cif', digest: 'a'.repeat(64),
};

function proteinFixture(sequences = ['AAAAAAAG', 'GGGGG']): Protein {
  const protein: Protein = { title: 'Observed test coordinates', modelNumber: '2', chains: [], residues: [], atoms: [], warnings: [] };
  sequences.forEach((sequence, chainIndex) => {
    const key = String.fromCharCode(65 + chainIndex);
    const residues: Residue[] = [...sequence].map((code, index) => {
      const definition = AMINO_ACIDS.find((amino) => amino.code === code)!;
      const residue: Residue = {
        key: `${key}:${index + 1}`, chainKey: key, authChain: key, labelChain: String(chainIndex + 1),
        authSeq: String(index + 1 + (index > 1 ? 10 : 0)), labelSeq: String(index + 1), insertion: index === 1 ? 'A' : '',
        name: definition.three, aminoAcid: code as AminoAcid, index, atomIndices: [], ca: [chainIndex * 100 + index, index, -index],
      };
      for (const name of ['CA', 'N']) {
        residue.atomIndices.push(protein.atoms.length);
        protein.atoms.push({
          name, element: name === 'N' ? 'N' : 'C', position: [residue.ca[0], residue.ca[1], residue.ca[2] + (name === 'N' ? 0.5 : 0)],
          residueKey: residue.key, alternate: '', occupancy: 1, bFactor: 20,
        });
      }
      return residue;
    });
    protein.chains.push({ key, label: `${key} / ${chainIndex + 1}`, authId: key, labelId: String(chainIndex + 1), sequence, residues });
    protein.residues.push(...residues);
  });
  return protein;
}

const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');
const coordinates = (document: Document): { points: number[][]; scope: string } =>
  JSON.parse(document.getElementById('atom-coordinates')!.textContent!);

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('FASTA', () => {
  it('wraps observed sequences at 80, preserves tails, and separates chains', () => {
    const protein = proteinFixture(['A'.repeat(161), 'GG']);
    const fasta = createFasta(source, protein);
    const lines = fasta.trimEnd().split('\n');
    expect(lines[0]).toContain('>1CRN|chain A / 1');
    expect(lines[0]).toContain('|model 2|observed CA sequence');
    expect(lines.slice(1, 4)).toEqual(['A'.repeat(80), 'A'.repeat(80), 'A']);
    expect(lines[4]).toContain('>1CRN|chain B / 2');
    expect(lines[5]).toBe('GG');
    expect(createFasta(source, protein, 'B')).not.toContain('chain A');
    expect(createFasta(source, protein, 'B').trimEnd().split('\n').slice(1)).toEqual(['GG']);
  });

  it('handles empty sources, rejects unknown chains, and prevents header-line injection', () => {
    expect(createFasta(source, proteinFixture([]))).toBe('');
    expect(() => createFasta(source, proteinFixture(), 'missing')).toThrow('Unknown FASTA chain');
    const fasta = createFasta({ ...source, id: 'name\n>injected\u2028header' }, proteinFixture(['A']));
    expect(fasta.split('\n').filter((line) => line.startsWith('>'))).toHaveLength(1);
  });
});

describe('standalone reports', () => {
  it('uses the supplied selected analysis, all accepted scoped atoms, and scoped FASTA', () => {
    const protein = proteinFixture();
    const analysis = analyzeProtein(protein, 'B');
    analysis.tripletCounts = { alpha: 0, beta: 1, turn: 0, random: 0 };
    const document = parse(createReportHtml(source, protein, analysis, 'overview'));
    expect(document.querySelector('.scope')!.textContent).toMatch(/^Chain: B \/ 2/);
    expect(document.getElementById('fasta')!.textContent).toBe(createFasta(source, protein, 'B'));
    expect(document.body.textContent).toContain('5 observed CA residues · 1 chains · 10 accepted atoms');
    expect(document.body.textContent).toContain('Beta propensity1');
    expect(coordinates(document).points).toEqual(protein.atoms.slice(16).map((atom) => atom.position));
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    expect(document.body.textContent).toContain('including non-CA atoms');
    expect(document.body.textContent).toContain('2 unscored trailing residues');
  });

  it('distinguishes identical short chain scopes without complete triplets', () => {
    const protein = proteinFixture(['AG', 'AG']);
    for (const key of ['A', 'B']) {
      const document = parse(createReportHtml(source, protein, analyzeProtein(protein, key), 'overview'));
      expect(document.querySelector('.scope')!.textContent).toMatch(new RegExp(`^Chain: ${key}`));
      expect(document.getElementById('fasta')!.textContent).toBe(createFasta(source, protein, key));
      expect(coordinates(document).points).toHaveLength(4);
      expect(coordinates(document).points[0]![0]).toBe(key === 'A' ? 0 : 100);
      expect(document.body.textContent).toContain('No complete triplets in this scope.');
    }
  });

  it('includes all-source atoms without CA residues and excludes them from a CA-scoped chain', () => {
    const protein = proteinFixture(['AG']);
    protein.atoms.push({ ...protein.atoms[0]!, name: 'N', residueKey: 'A:missing-CA', position: [999, 10, 20] });
    const all = parse(createReportHtml(source, protein, analyzeProtein(protein), 'overview'));
    const selected = parse(createReportHtml(source, protein, analyzeProtein(protein, 'A'), 'overview'));
    expect(all.querySelector('.scope')!.textContent).toMatch(/^All chains:/);
    expect(selected.querySelector('.scope')!.textContent).toBe(all.querySelector('.scope')!.textContent);
    expect(coordinates(all).points).toHaveLength(5);
    expect(coordinates(selected).points).toHaveLength(4);
    expect(selected.body.textContent).toContain('attached to observed CA residues in this chain scope');
  });

  it('retains repeated instances, numbering gaps, insertion codes, thresholds, and source provenance', () => {
    const protein = proteinFixture();
    const analysis = analyzeProtein(protein);
    const html = createReportHtml(source, protein, analysis, 'triplets');
    const document = parse(html);
    const instances = document.getElementById('triplet-instances')!.textContent!;
    expect(instances.split('\n')).toHaveLength(analysis.triplets.length + 1);
    expect(instances.match(/\tAAA\t/g)).toHaveLength(2);
    expect(instances).toContain('1, 2A, 13');
    expect(instances).toContain('A:1, A:2, A:3');
    expect(document.body.textContent).toContain('4 trailing residues');
    for (const text of ['non-overlapping', 'every repeated occurrence', 'numbering gaps', 'not structural assignment',
      'alpha > 1.1, beta < 1.2, turn < 1.3', 'alpha < 1.1, beta > 1, turn < 1.3',
      'alpha < 1.25, beta < 1, turn > 1.15', source.digest!, source.fetchedAt, ANALYSIS_VERSION, source.filename, source.sourceUrl!]) {
      expect(document.body.textContent).toContain(text);
    }
    expect(document.querySelectorAll('canvas,script[type="application/json"]')).toHaveLength(0);
    expect(document.getElementById('fasta')!.textContent).toBe(createFasta(source, protein));
    expect(createReportHtml(source, protein, analysis, 'triplets')).toBe(html);
  });

  it('escapes metadata and inline JSON without script breakouts or external resource references', () => {
    const attack = '</script><img src="https://bad.invalid/" onerror="alert(1)"> & \u2028 \u2029';
    const protein = proteinFixture(['AAA']);
    protein.title = attack;
    protein.modelNumber = attack;
    protein.chains[0]!.label = attack;
    protein.warnings = [attack];
    const untrusted = { ...source, id: attack, filename: attack, digest: attack, sourceUrl: 'javascript:alert(1)', fetchedAt: attack };
    for (const kind of ['overview', 'triplets'] as const) {
      const html = createReportHtml(untrusted, protein, analyzeProtein(protein), kind);
      const document = parse(html);
      expect(html).not.toContain(attack);
      expect(document.querySelectorAll('img,iframe,object,form,a,[src],[href]')).toHaveLength(0);
      expect(document.body.textContent).toContain(attack);
      expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content')).toContain("connect-src 'none'");
      const scripts = [...document.querySelectorAll('script:not([type="application/json"])')];
      expect(scripts).toHaveLength(1);
      expect(() => new Function(scripts[0]!.textContent!)).not.toThrow();
      if (kind === 'overview') {
        const json = document.getElementById('atom-coordinates')!.textContent!;
        for (const escaped of ['\\u003c', '\\u0026', '\\u2028', '\\u2029']) expect(json).toContain(escaped);
        expect(coordinates(document).scope).toContain(attack);
      }
    }
  });

  it('handles empty analysis and omits non-finite triples with a visible explanation', () => {
    const empty = proteinFixture([]);
    const emptyReport = parse(createReportHtml(source, empty, analyzeProtein(empty), 'overview'));
    expect(coordinates(emptyReport).points).toEqual([]);
    expect(emptyReport.body.textContent).toContain('No complete triplets in this scope.');
    expect(emptyReport.body.textContent).toContain('No observed sequence.');
    expect(emptyReport.querySelector('main')!.textContent).not.toMatch(/NaN|Infinity/);
    const protein = proteinFixture(['A']);
    protein.atoms[1]!.position = [Infinity, 0, 0];
    const report = parse(createReportHtml({ ...source, digest: undefined }, protein, analyzeProtein(protein), 'overview'));
    expect(coordinates(report).points).toHaveLength(1);
    expect(report.body.textContent).toContain('1 non-finite coordinates omitted');
    expect(report.body.textContent).toContain('Not available; not computed');
  });

  it('keeps the DOM bounded for 100,000 atoms and thousands of triplets', () => {
    const protein = proteinFixture(['A'.repeat(600)]);
    protein.atoms = Array.from({ length: 100_000 }, (_, index) => ({ ...protein.atoms[index % 1200]!, position: [index, 0, 0] }));
    const document = parse(createReportHtml(source, protein, analyzeProtein(protein), 'overview'));
    expect(coordinates(document).points).toHaveLength(100_000);
    expect(document.querySelectorAll('*').length).toBeLessThan(400);
    expect(document.getElementById('triplet-instances')!.textContent!.split('\n')).toHaveLength(201);
  });

  it('rejects a scope that refers to another protein', () => {
    const protein = proteinFixture();
    expect(() => createReportHtml(source, protein, { ...analyzeProtein(protein), chainKeys: ['missing'] }, 'overview')).toThrow('scope does not match');
    expect(() => createReportHtml(source, protein, { ...analyzeProtein(protein, 'B'), atomCount: 1 }, 'overview')).toThrow('atom count does not match');
  });
});

function runtimeFixture(canvasAvailable = true, kind: 'overview' | 'triplets' = 'overview') {
  const protein = proteinFixture(['AAA']);
  const document = parse(createReportHtml(source, protein, analyzeProtein(protein), kind));
  const context = { setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '' };
  const canvas = document.querySelector('canvas');
  if (canvas) {
    vi.spyOn(canvas, 'getContext').mockReturnValue(canvasAvailable ? context as unknown as CanvasRenderingContext2D : null);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 900, 480));
    canvas.setPointerCapture = vi.fn();
  }
  const window = Object.assign(new EventTarget(), { print: vi.fn(), devicePixelRatio: 4 });
  const frames: FrameRequestCallback[] = [];
  const script = document.querySelector('script:not([type])')!.textContent!;
  new Function('window', 'document', 'getComputedStyle', 'requestAnimationFrame', script)(
    window, document, () => ({ getPropertyValue: () => '#24654f' }), (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; },
  );
  return { document, window, canvas, context, frames };
}

describe('embedded offline interactions', () => {
  it('rotates, zooms, resets, redraws only on demand, and caps pixel ratio', () => {
    const { document, window, canvas, context, frames } = runtimeFixture();
    const plot = canvas!;
    expect(frames).toHaveLength(1);
    frames.shift()!(0);
    expect(context.fillRect).toHaveBeenCalledTimes(6);
    expect(plot.width).toBe(1800);
    expect(plot.height).toBe(960);
    expect(frames).toHaveLength(0);
    document.querySelector<HTMLButtonElement>('[data-view="right"]')!.click();
    plot.dispatchEvent(new KeyboardEvent('keydown', { key: '+', cancelable: true }));
    expect(document.getElementById('plot-status')!.textContent).toContain('zoom 120%');
    expect(frames).toHaveLength(1);
    const pointer = (type: string, x: number) => plot.dispatchEvent(Object.assign(new Event(type, { cancelable: true }),
      { button: 0, pointerId: 1, clientX: x, clientY: 10 }));
    pointer('pointerdown', 0); pointer('pointermove', 30); pointer('pointerup', 30);
    expect(plot.setPointerCapture).toHaveBeenCalledWith(1);
    expect(document.getElementById('plot-status')!.textContent).toContain('Horizontal rotation 26°');
    plot.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    expect(document.getElementById('plot-status')!.textContent).toContain('zoom 100%');
    document.querySelector<HTMLButtonElement>('[data-view="reset"]')!.click();
    expect(document.getElementById('plot-status')!.textContent).toContain('Horizontal rotation 0°, vertical rotation 0°, zoom 100%');
    frames.shift()!(0);
    expect(frames).toHaveLength(0);
    window.dispatchEvent(new Event('resize'));
    expect(frames).toHaveLength(1);
    window.dispatchEvent(new Event('beforeprint'));
    expect(context.fillStyle).toBe('#182923');
  });

  it('changes theme, prints expanded data, and restores details after printing', () => {
    const { document, window } = runtimeFixture(true, 'triplets');
    const appearance = document.getElementById('appearance') as HTMLSelectElement;
    expect(appearance.disabled).toBe(false);
    appearance.value = 'dark'; appearance.dispatchEvent(new Event('change'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    document.getElementById('print-report')!.click();
    expect(window.print).toHaveBeenCalledOnce();
    expect(document.querySelector('details')!.open).toBe(false);
    window.dispatchEvent(new Event('beforeprint'));
    expect(document.querySelector('details')!.open).toBe(true);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('details')!.open).toBe(false);
  });

  it('keeps semantic coordinate alternatives when canvas is unavailable', () => {
    const { document, canvas, frames } = runtimeFixture(false);
    expect(canvas!.hidden).toBe(true);
    expect(document.getElementById('plot-status')!.textContent).toContain('Canvas is unavailable');
    expect(document.querySelector<HTMLButtonElement>('[data-view]')!.disabled).toBe(true);
    expect(document.querySelectorAll('table caption').length).toBeGreaterThan(2);
    expect(frames).toHaveLength(0);
  });
});

function downloadMocks() {
  vi.useFakeTimers();
  const blobs: Blob[] = [], names: string[] = [];
  const revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:export-fixture'; }), revokeObjectURL: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.isConnected).toBe(true);
    expect(this.href).toBe('blob:export-fixture');
    names.push(this.download);
  });
  return { blobs, names, revoke, click };
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe('Blob downloads', () => {
  it('preserves source text bytes, decompressed filenames, and exact binary subarray bytes', async () => {
    const { blobs, names, revoke } = downloadMocks();
    downloadSource(source);
    const raw = new Uint8Array([77, 0, 255, 13, 10, 88]);
    downloadSource({ ...source, filename: '../raw\\file\u0000.bcif', format: 'bcif', data: raw.subarray(1, 5) });
    raw.fill(9);
    expect(blobs[1]!.type).toBe('application/octet-stream');
    expect(names[0]).toBe('1CRN.cif');
    expect(names[1]).not.toMatch(/[/\\\u0000-\u001f]/);
    expect(names[1]).toMatch(/\.bcif$/);
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    expect(new TextDecoder().decode(await readBlob(blobs[0]!))).toBe(source.data);
    expect([...new Uint8Array(await readBlob(blobs[1]!))]).toEqual([0, 255, 13, 10]);
  });

  it('downloads actual standalone HTML and FASTA with distinct useful filenames', async () => {
    const { blobs, names } = downloadMocks();
    const protein = proteinFixture();
    downloadReport(source, protein, analyzeProtein(protein, 'B'), 'overview');
    downloadReport(source, protein, analyzeProtein(protein), 'triplets');
    downloadFasta(source, protein, 'B');
    expect(names).toEqual(['1CRN-overview.html', '1CRN-triplets.html', '1CRN-chain-B.fasta']);
    expect(blobs[0]!.type).toBe('text/html;charset=utf-8');
    vi.runAllTimers();
    vi.useRealTimers();
    expect(new TextDecoder().decode(await readBlob(blobs[0]!))).toContain('<canvas');
    expect(new TextDecoder().decode(await readBlob(blobs[1]!))).toContain('All triplet instances');
    expect(new TextDecoder().decode(await readBlob(blobs[2]!))).toBe(createFasta(source, protein, 'B'));
  });

  it('cleans up the anchor and URL even when initiating the download throws', () => {
    const { revoke, click } = downloadMocks();
    click.mockImplementation(() => { throw new Error('click failed'); });
    expect(() => downloadSource(source)).toThrow('click failed');
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:export-fixture');
  });
});
