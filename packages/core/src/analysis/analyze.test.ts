import { describe, expect, it } from 'vitest';
import type { Protein } from '../domain/types';
import { parseStructure } from '../formats/parse';
import { pdbAtom, source } from '../formats/fixtures/structures';
import { analyzeProtein, classifyTriplet } from './analyze';
import { AMINO_ACIDS, ANALYSIS_VERSION, GROUP_LABELS, PROPENSITIES, TRIPLET_LABELS } from './constants';
import golden from './fixtures/legacy-triplets.json';

async function proteinFor(chains: Record<string, string>): Promise<Protein> {
  return parseStructure(source(Object.entries(chains).flatMap(([chain, sequence]) =>
    [...sequence].map((code, index) => pdbAtom({
      chain, position: index + 1, residue: AMINO_ACIDS.find((amino) => amino.code === code)!.three,
    })),
  ).join('\n')));
}

describe('legacy scientific parity', () => {
  it('matches Python scores and classification for all 8,000 possible triplets', () => {
    expect(Object.keys(golden)).toHaveLength(8000);
    expect(new Set(Object.keys(golden))).toHaveLength(8000);
    for (const [sequence, [alpha, beta, turn, classification]] of Object.entries(golden)) {
      expect(classifyTriplet(sequence), sequence).toEqual({ scores: [alpha, beta, turn], classification });
    }
  });

  it('exports the complete legacy amino-acid table and labels', () => {
    expect(AMINO_ACIDS).toHaveLength(20);
    expect(new Set(AMINO_ACIDS.map((amino) => amino.code))).toHaveLength(20);
    expect(Object.keys(PROPENSITIES)).toHaveLength(20);
    expect(AMINO_ACIDS.map((amino) => amino.code).join('')).toBe('GAVLIMFWPSTCYNQDEKRH');
    expect(PROPENSITIES.A).toEqual([1.25, 0.89, 0.78]);
    expect(TRIPLET_LABELS).toEqual({ alpha: 'Alpha', beta: 'Beta', turn: 'Beta turn', random: 'Random' });
    expect(Object.keys(GROUP_LABELS)).toHaveLength(4);
    expect(ANALYSIS_VERSION).not.toBe('');
  });

  it.each(['', 'A', 'AA', 'AAAA', 'AAAV'])('rejects incomplete or overlong triplet %j', (sequence) => {
    expect(() => classifyTriplet(sequence)).toThrow('exactly three');
  });

  it.each(['AAZ', 'AAA?', 'aaa', 'AXA', ' A ', 'A💚'])('rejects invalid triplet %j', (sequence) => {
    expect(() => classifyTriplet(sequence)).toThrow('Unrecognized amino acids');
  });
});

describe('observed protein analysis', () => {
  it('counts repeated triplets, exact residue identities and composition including tails', async () => {
    const protein = await proteinFor({ A: 'AAAAAAVVVAGMAV', B: 'GGG' });
    const result = analyzeProtein(protein);
    expect(result.tripletCounts).toEqual({ alpha: 2, beta: 1, turn: 1, random: 1 });
    expect(result.triplets.map((triplet) => triplet.sequence)).toEqual(['AAA', 'AAA', 'VVV', 'AGM', 'GGG']);
    expect(result.tailCount).toBe(2);
    expect(result.residueCount).toBe(17);
    expect(result.atomCount).toBe(17);
    expect(result.chainCount).toBe(2);
    expect(result.chainKeys).toEqual(protein.chains.map((chain) => chain.key));
    expect(result.composition.find((amino) => amino.code === 'A')?.count).toBe(8);
    expect(result.composition.reduce((sum, amino) => sum + amino.percent, 0)).toBeCloseTo(100, 10);
    expect(new Set(result.triplets.map((triplet) => triplet.id))).toHaveLength(5);
    expect(result.triplets[1]?.residueKeys).toEqual(protein.residues.slice(3, 6).map((residue) => residue.key));
    expect(result.triplets.map((triplet) => triplet.index)).toEqual([0, 3, 6, 9, 0]);
    for (const triplet of result.triplets) {
      const chain = protein.chains.find((candidate) => candidate.key === triplet.chainKey)!;
      expect(chain.residues.slice(triplet.index, triplet.index + 3).map((residue) => residue.key))
        .toEqual(triplet.residueKeys);
    }
  });

  it('never crosses a chain boundary, even when combined tails make a triplet', async () => {
    const protein = await proteinFor({ A: 'AA', B: 'V' });
    const result = analyzeProtein(protein);
    expect(result.triplets).toEqual([]);
    expect(result.chainKeys).toEqual(protein.chains.map((chain) => chain.key));
    expect(result.tailCount).toBe(3);
    expect(result.tripletCounts).toEqual({ alpha: 0, beta: 0, turn: 0, random: 0 });
  });

  it('filters a chain by its normalized key and counts every selected atom', async () => {
    const protein = await parseStructure(source([
      pdbAtom(), pdbAtom({ name: 'N' }), pdbAtom({ chain: 'B', residue: 'VAL' }),
    ].join('\n')));
    const result = analyzeProtein(protein, protein.chains[0]!.key);
    expect(result).toMatchObject({ residueCount: 1, atomCount: 2, chainCount: 1, tailCount: 1 });
    expect(result.chainKeys).toEqual([protein.chains[0]!.key]);
    expect(result.triplets).toEqual([]);
    expect(result.composition.find((amino) => amino.code === 'A')?.percent).toBe(100);
    expect(() => analyzeProtein(protein, 'unknown')).toThrow('Unknown chain');
  });

  it('has finite zero percentages for an empty protein', () => {
    const empty: Protein = { title: '', chains: [], residues: [], atoms: [], modelNumber: '1', warnings: [] };
    const result = analyzeProtein(empty);
    expect(result).toMatchObject({ residueCount: 0, atomCount: 0, chainCount: 0, tailCount: 0, triplets: [] });
    expect(result.chainKeys).toEqual([]);
    expect(result.composition).toHaveLength(20);
    expect(result.composition.every((amino) => amino.percent === 0 && amino.count === 0)).toBe(true);
  });

  it.each(['AAZ', 'AAA?', 'aaa', 'AAA '])('validates the entire chain including invalid tail %j', async (sequence) => {
    const protein = await proteinFor({ A: 'AAA' });
    protein.chains[0]!.sequence = sequence;
    expect(() => analyzeProtein(protein)).toThrow('Unrecognized amino acids');
  });

  it('rejects sequence/residue disagreement rather than misattributing triplets', async () => {
    const protein = await proteinFor({ A: 'AAA' });
    protein.chains[0]!.sequence = 'VVV';
    expect(() => analyzeProtein(protein)).toThrow('Sequence and residue identities disagree');
  });
});
