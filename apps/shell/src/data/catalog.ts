export interface CatalogEntry {
  id: string;
  name: string;
  organism: string;
  description: string;
  topic: string;
}

export const CATALOG: readonly CatalogEntry[] = [
  { id: '1CRN', name: 'Crambin', organism: 'Crambe hispanica',
    description: 'A compact plant protein. A good place to connect sequence, composition, and structure.', topic: 'Start here' },
  { id: '1UBQ', name: 'Ubiquitin', organism: 'Homo sapiens',
    description: 'A small protein that helps tag other proteins for degradation.', topic: 'Cell signaling' },
  { id: '4INS', name: 'Insulin', organism: 'Sus scrofa',
    description: 'Explore the chains of porcine insulin. Zinc can be displayed, but is not part of the amino-acid analysis.', topic: 'Multiple chains' },
  { id: '1LYZ', name: 'Lysozyme', organism: 'Gallus gallus',
    description: 'An enzyme in egg white that acts on bacterial cell walls.', topic: 'Enzyme' },
  { id: '1MBN', name: 'Myoglobin', organism: 'Physeter macrocephalus',
    description: 'An oxygen-binding protein. Show ligands to see the heme group outside the protein-only analysis.', topic: 'Oxygen binding' },
  { id: '1GFL', name: 'Green fluorescent protein', organism: 'Aequorea victoria',
    description: 'Explore the beta-barrel fold. The observed-residue analysis does not describe full chromophore chemistry.', topic: 'Beta-barrel' },
  { id: '2HHB', name: 'Hemoglobin', organism: 'Homo sapiens',
    description: 'Four protein chains working together. Isolate a chain to compare its amino-acid composition.', topic: 'Protein complex' },
];
