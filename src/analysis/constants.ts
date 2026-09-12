import type { AminoAcid, AminoDefinition, AminoGroup, Point3, TripletClass } from '../domain/types';

export const ANALYSIS_VERSION = 'legacy-triplet-v1';

export const AMINO_ACIDS: readonly AminoDefinition[] = [
  { code: 'G', three: 'GLY', name: 'Glycine', group: 'nonpolar' },
  { code: 'A', three: 'ALA', name: 'Alanine', group: 'nonpolar' },
  { code: 'V', three: 'VAL', name: 'Valine', group: 'nonpolar' },
  { code: 'L', three: 'LEU', name: 'Leucine', group: 'nonpolar' },
  { code: 'I', three: 'ILE', name: 'Isoleucine', group: 'nonpolar' },
  { code: 'M', three: 'MET', name: 'Methionine', group: 'nonpolar' },
  { code: 'F', three: 'PHE', name: 'Phenylalanine', group: 'nonpolar' },
  { code: 'W', three: 'TRP', name: 'Tryptophan', group: 'nonpolar' },
  { code: 'P', three: 'PRO', name: 'Proline', group: 'nonpolar' },
  { code: 'S', three: 'SER', name: 'Serine', group: 'polar' },
  { code: 'T', three: 'THR', name: 'Threonine', group: 'polar' },
  { code: 'C', three: 'CYS', name: 'Cysteine', group: 'polar' },
  { code: 'Y', three: 'TYR', name: 'Tyrosine', group: 'polar' },
  { code: 'N', three: 'ASN', name: 'Asparagine', group: 'polar' },
  { code: 'Q', three: 'GLN', name: 'Glutamine', group: 'polar' },
  { code: 'D', three: 'ASP', name: 'Aspartic Acid', group: 'negative' },
  { code: 'E', three: 'GLU', name: 'Glutamic Acid', group: 'negative' },
  { code: 'K', three: 'LYS', name: 'Lysine', group: 'positive' },
  { code: 'R', three: 'ARG', name: 'Arginine', group: 'positive' },
  { code: 'H', three: 'HIS', name: 'Histidine', group: 'positive' },
];

export const PROPENSITIES: Record<AminoAcid, Point3> = {
  A: [1.25, 0.89, 0.78], R: [0.99, 1.02, 0.88],
  N: [0.87, 0.86, 1.28], D: [1.03, 0.74, 1.41],
  C: [1.12, 0.85, 0.8], E: [1.45, 0.65, 1],
  Q: [1.24, 0.82, 0.97], G: [0.57, 0.93, 1.64],
  H: [1.25, 1.04, 0.69], I: [0.94, 1.41, 0.51],
  L: [1.32, 1.03, 0.59], K: [1.24, 0.81, 0.96],
  M: [1.43, 0.99, 0.39], F: [1.08, 1.22, 0.58],
  P: [0.6, 0.71, 1.91], S: [0.82, 0.96, 1.33],
  T: [0.81, 1.13, 1.03], W: [1.03, 1.15, 0.75],
  Y: [0.75, 1.25, 1.05], V: [0.88, 1.48, 0.47],
};

export const TRIPLET_LABELS: Record<TripletClass, string> = {
  alpha: 'Alpha', beta: 'Beta', turn: 'Beta turn', random: 'Random',
};

export const GROUP_LABELS: Record<AminoGroup, string> = {
  nonpolar: 'Nonpolar',
  polar: 'Polar, uncharged',
  negative: 'Negatively charged',
  positive: 'Positively charged',
};
