import type { SourceFile, StructureFormat } from '../domain/types';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function normalizeAccession(value: string): string {
  const id = value.trim();
  if (/^[0-9][a-z0-9]{3}$/i.test(id)) return id.toUpperCase();
  if (/^pdb_[a-z0-9]{8}$/i.test(id)) {
    const normalized = id.toLowerCase();
    const legacy = normalized.slice(8);
    return normalized.startsWith('pdb_0000') && /^[0-9][a-z0-9]{3}$/.test(legacy)
      ? legacy.toUpperCase() : normalized;
  }
  throw new Error('Enter a PDB ID such as 1CRN or an extended ID such as pdb_00001crn.');
}

export async function readLimited(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FILE_BYTES) {
        await reader.cancel();
        throw new Error('This file exceeds the 20 MB browser limit. Choose a smaller structure.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}

export async function sourceDigest(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : Uint8Array.from(data);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function fetchStructure(value: string, signal: AbortSignal, bundled = false): Promise<SourceFile> {
  const id = normalizeAccession(value);
  const url = bundled
    ? `${import.meta.env.BASE_URL}examples/1crn.cif`
    : `https://files.rcsb.org/download/${id}.cif`;
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    credentials: 'omit',
  });
  if (!response.ok) {
    throw new Error(`Could not load ${id}: ${response.status === 404 ? 'structure not found' : `HTTP ${response.status}`}. Check the ID and try again.`);
  }
  if (!response.body) throw new Error('The structure response was empty. Try again.');
  const bytes = await readLimited(response.body);
  const data = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return {
    id, filename: `${id}.cif`, format: 'mmcif', data,
    origin: bundled ? 'example' : 'rcsb', fetchedAt: new Date().toISOString(),
    sourceUrl: `https://files.rcsb.org/download/${id}.cif`,
    digest: await sourceDigest(data),
  };
}

export async function importStructure(file: File): Promise<SourceFile> {
  if (file.size > MAX_FILE_BYTES) throw new Error('This file exceeds the 20 MB browser limit.');
  const name = file.name.toLowerCase().replace(/\.gz$/, '');
  let format: StructureFormat;
  if (name.endsWith('.pdb')) format = 'pdb';
  else if (name.endsWith('.cif') || name.endsWith('.mmcif')) format = 'mmcif';
  else if (name.endsWith('.bcif')) format = 'bcif';
  else throw new Error('Choose a .pdb, .cif, .mmcif, or .bcif file (optionally .gz).');
  const stream = file.name.toLowerCase().endsWith('.gz')
    ? file.stream().pipeThrough(new DecompressionStream('gzip')) : file.stream();
  const bytes = await readLimited(stream);
  const data = format === 'bcif' ? bytes : new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const digest = await sourceDigest(data);
  return {
    id: `local-${digest.slice(0, 12)}`, filename: file.name.replace(/\.gz$/i, ''),
    format, data, digest, origin: 'local', fetchedAt: new Date().toISOString(),
  };
}

export function sourceLink(source: SourceFile): string | null {
  return source.origin === 'local' ? null : `https://www.rcsb.org/structure/${source.id}`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') return 'The download timed out. Check your connection and try again.';
    if (error.name === 'QuotaExceededError') return 'Device storage is full. Export your work and remove saved structures to free space.';
    return error.message;
  }
  return 'The operation failed. Try again or choose another structure.';
}
