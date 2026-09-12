import type { AminoAcid, Analysis, Point3, Protein, TripletClass } from '../domain/types';
import { AMINO_ACIDS, PROPENSITIES } from './constants';

function validateSequence(sequence: string): asserts sequence is string {
  const invalid = [...new Set([...sequence].filter((code) => !Object.hasOwn(PROPENSITIES, code)))];
  if (invalid.length) {
    throw new Error(`Unrecognized amino acids: ${invalid.sort().join(', ')}`);
  }
}

/** Classifies one complete triplet using rounded legacy scores and ordered thresholds. */
export function classifyTriplet(sequence: string): { scores: Point3; classification: TripletClass } {
  validateSequence(sequence);
  if (sequence.length !== 3) throw new Error('A triplet must contain exactly three amino acids.');
  const scores: Point3 = [0, 0, 0];
  for (const code of sequence) {
    const propensity = PROPENSITIES[code as AminoAcid];
    scores[0] += propensity[0];
    scores[1] += propensity[1];
    scores[2] += propensity[2];
  }
  // Two-decimal inputs averaged over three never land on a four-decimal rounding tie.
  scores[0] = Math.round(scores[0] / 3 * 10_000) / 10_000;
  scores[1] = Math.round(scores[1] / 3 * 10_000) / 10_000;
  scores[2] = Math.round(scores[2] / 3 * 10_000) / 10_000;
  const [alpha, beta, turn] = scores;
  const classification = alpha > 1.1 && beta < 1.2 && turn < 1.3 ? 'alpha'
    : alpha < 1.1 && beta > 1 && turn < 1.3 ? 'beta'
      : alpha < 1.25 && beta < 1 && turn > 1.15 ? 'turn' : 'random';
  return { scores, classification };
}

/** Counts observed residues and triplets; triplet indices are zero-based starting offsets within a chain. */
export function analyzeProtein(protein: Protein, chainKey: string | null = null): Analysis {
  const chains = chainKey === null ? protein.chains : protein.chains.filter((chain) => chain.key === chainKey);
  if (chainKey !== null && !chains.length) throw new Error(`Unknown chain: ${chainKey}`);
  const counts = new Map<AminoAcid, number>();
  const analysis: Analysis = {
    chainKeys: chains.map((chain) => chain.key),
    residueCount: 0,
    atomCount: chainKey === null ? protein.atoms.length : 0,
    chainCount: chains.length,
    composition: [],
    triplets: [],
    tripletCounts: { alpha: 0, beta: 0, turn: 0, random: 0 },
    tailCount: 0,
  };
  const selectedAtomIndices = new Set<number>();
  for (const chain of chains) {
    validateSequence(chain.sequence);
    if (chain.sequence !== chain.residues.map((residue) => residue.aminoAcid).join('')) {
      throw new Error(`Sequence and residue identities disagree for chain ${chain.label}.`);
    }
    for (const residue of chain.residues) {
      counts.set(residue.aminoAcid, (counts.get(residue.aminoAcid) ?? 0) + 1);
      if (chainKey !== null) {
        for (const index of residue.atomIndices) selectedAtomIndices.add(index);
      }
    }
    analysis.residueCount += chain.sequence.length;
    analysis.tailCount += chain.sequence.length % 3;
    for (let start = 0; start + 2 < chain.residues.length; start += 3) {
      const first = chain.residues[start]!;
      const second = chain.residues[start + 1]!;
      const third = chain.residues[start + 2]!;
      const sequence = chain.sequence.slice(start, start + 3);
      const result = classifyTriplet(sequence);
      analysis.triplets.push({
        id: JSON.stringify([chain.key, start]),
        chainKey: chain.key,
        index: start,
        sequence,
        ...result,
        residueKeys: [first.key, second.key, third.key],
      });
      analysis.tripletCounts[result.classification] += 1;
    }
  }
  if (chainKey !== null) analysis.atomCount = selectedAtomIndices.size;
  analysis.composition = AMINO_ACIDS.map((definition) => {
    const count = counts.get(definition.code) ?? 0;
    return { ...definition, count, percent: analysis.residueCount ? count * 100 / analysis.residueCount : 0 };
  });
  return analysis;
}
