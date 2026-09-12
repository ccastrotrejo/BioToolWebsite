import { describe, expect, it } from 'vitest';
import type { Residue } from '@biotool/core/domain/types';
import { createResidueResolver } from './identity';

function residue(changes: Partial<Residue> = {}): Residue {
  return {
    key: 'opaque key / not a residue number',
    chainKey: 'chain A',
    authChain: 'A',
    labelChain: 'X',
    authSeq: '42',
    labelSeq: '7',
    insertion: '',
    name: 'ALA',
    aminoAcid: 'A',
    index: 0,
    atomIndices: [0],
    ca: [0, 0, 0],
    ...changes,
  };
}

describe('residue identity mapping', () => {
  it('keeps chains, insertions, and first-model identities distinct', () => {
    const a = residue();
    const b = residue({ key: 'other chain', authChain: 'B', labelChain: 'Y' });
    const insertion = residue({ key: 'insertion', insertion: 'A' });
    const resolve = createResidueResolver([a, b, insertion], 'mmcif');
    expect(resolve(a, true)).toBe(a);
    expect(resolve(b, true)).toBe(b);
    expect(resolve(insertion, true)).toBe(insertion);
    expect(resolve(a, false)).toBeUndefined();
    expect(resolve({ ...a, authChain: 'C' }, true)).toBeUndefined();
    expect(resolve({ ...a, insertion: 'B' }, true)).toBeUndefined();
  });

  it('uses label identities to disambiguate reused author chains', () => {
    const a = residue();
    const b = residue({ key: 'second label', labelChain: 'Y' });
    const resolve = createResidueResolver([a, b], 'bcif');
    expect(resolve(b, true)).toBe(b);
    expect(resolve({ ...a, labelChain: 'Z' }, true)).toBeUndefined();
    expect(resolve({ ...a, labelSeq: '8' }, true)).toBeUndefined();
  });

  it('allows generated PDB labels, including blank author chains', () => {
    const a = residue({ authChain: '', labelChain: '', labelSeq: null });
    const resolve = createResidueResolver([a], 'pdb');
    expect(resolve({ ...a, labelChain: 'A', labelSeq: '1' }, true)).toBe(a);
  });

  it('does not guess an ambiguous PDB residue', () => {
    const a = residue();
    const b = residue({ key: 'ambiguous', labelChain: 'Y' });
    const resolve = createResidueResolver([a, b], 'pdb');
    expect(resolve({ ...a, labelChain: 'Z' }, true)).toBeUndefined();
  });

  it('preserves author identifiers as strings, including different spellings of numbers', () => {
    const a = residue({ authSeq: '+0042', labelSeq: '007' });
    const b = residue({ key: 'another author identifier', authSeq: '42', labelSeq: '007' });
    const resolve = createResidueResolver([a, b], 'mmcif');
    expect(resolve(a, true)).toBe(a);
    expect(resolve(b, true)).toBe(b);
  });

  it('distinguishes missing CIF label sequence IDs from numbered label sequence IDs', () => {
    const unnumbered = residue({ key: 'unnumbered', labelSeq: null });
    const numbered = residue({ key: 'numbered', labelSeq: '7' });
    const resolve = createResidueResolver([unnumbered, numbered], 'mmcif');
    expect(resolve(unnumbered, true)).toBe(unnumbered);
    expect(resolve(numbered, true)).toBe(numbered);
    expect(createResidueResolver([numbered], 'bcif')(unnumbered, true)).toBeUndefined();
  });
});
