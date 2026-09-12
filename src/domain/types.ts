export type StructureFormat = 'pdb' | 'mmcif' | 'bcif';
export type Appearance = 'dark' | 'light';
export type TripletClass = 'alpha' | 'beta' | 'turn' | 'random';
export type AminoGroup = 'nonpolar' | 'polar' | 'negative' | 'positive';
export type AminoAcid = 'A' | 'R' | 'N' | 'D' | 'C' | 'E' | 'Q' | 'G' | 'H' | 'I'
  | 'L' | 'K' | 'M' | 'F' | 'P' | 'S' | 'T' | 'W' | 'Y' | 'V';
export type Point3 = [number, number, number];

export interface SourceFile {
  id: string;
  filename: string;
  format: StructureFormat;
  data: string | Uint8Array;
  origin: 'rcsb' | 'local' | 'example';
  fetchedAt: string;
  sourceUrl?: string;
  digest?: string;
}

export interface Residue {
  key: string;
  chainKey: string;
  authChain: string;
  labelChain: string;
  authSeq: string;
  labelSeq: string | null;
  insertion: string;
  name: string;
  aminoAcid: AminoAcid;
  index: number;
  atomIndices: number[];
  ca: Point3;
}

export interface Atom {
  name: string;
  element: string;
  position: Point3;
  residueKey: string;
  alternate: string;
  occupancy: number | null;
  bFactor: number | null;
}

export interface Chain {
  key: string;
  label: string;
  authId: string;
  labelId: string;
  residues: Residue[];
  sequence: string;
}

export interface Protein {
  title: string;
  chains: Chain[];
  residues: Residue[];
  atoms: Atom[];
  modelNumber: string;
  warnings: string[];
}

export interface AminoDefinition {
  code: AminoAcid;
  three: string;
  name: string;
  group: AminoGroup;
}

export interface CompositionEntry extends AminoDefinition {
  count: number;
  percent: number;
}

export interface Triplet {
  id: string;
  chainKey: string;
  index: number;
  sequence: string;
  scores: Point3;
  classification: TripletClass;
  residueKeys: [string, string, string];
}

export interface Analysis {
  chainKeys: string[];
  residueCount: number;
  atomCount: number;
  chainCount: number;
  composition: CompositionEntry[];
  triplets: Triplet[];
  tripletCounts: Record<TripletClass, number>;
  tailCount: number;
}
