import { describe, expect, it, beforeEach } from 'vitest';
import { clearLibrary, getSaved, listSaved, removeSaved, saveStructure } from './library';
import { normalizeAccession } from './source';
import type { SourceFile } from '../domain/types';

const source: SourceFile = {
  id: '1CRN', data: 'data_example', format: 'mmcif', filename: '1CRN.cif',
  fetchedAt: '2026-09-12T00:00:00Z', origin: 'rcsb',
};

describe('accessions', () => {
  it('normalizes legacy IDs and their explicit aliases without truncating modern IDs', () => {
    expect(normalizeAccession(' 1crn ')).toBe('1CRN');
    expect(normalizeAccession('PDB_00001CRN')).toBe('1CRN');
    expect(normalizeAccession('pdb_1234abcd')).toBe('pdb_1234abcd');
  });
  it.each(['', '../1CRN', 'ABCD', 'https://rcsb.org/1crn', '1CRN/', 'pdb_abcd'])('rejects %s', (value) => {
    expect(() => normalizeAccession(value)).toThrow('Enter a PDB ID');
  });
});

describe('device library', () => {
  beforeEach(clearLibrary);
  it('stores exact sources, replaces atomically and removes individual items', async () => {
    await saveStructure({ source, title: 'Crambin', residueCount: 46 });
    expect((await getSaved('1CRN'))?.source).toEqual(source);
    await saveStructure({ source: { ...source, data: 'replacement' }, title: 'New', residueCount: 47 });
    expect(await listSaved()).toHaveLength(1);
    expect((await getSaved('1CRN'))?.source.data).toBe('replacement');
    await removeSaved('1CRN');
    expect(await listSaved()).toEqual([]);
  });
  it('retains BinaryCIF bytes', async () => {
    const binary = { ...source, format: 'bcif' as const, data: new Uint8Array([1, 2, 3]) };
    await saveStructure({ source: binary, title: 'Binary', residueCount: 1 });
    const data = (await getSaved('1CRN'))?.source.data;
    if (data === undefined || typeof data === 'string') throw new Error('Binary data was not preserved.');
    expect(Array.from(data)).toEqual([1, 2, 3]);
  });
});
