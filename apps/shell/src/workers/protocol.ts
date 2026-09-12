import type { Protein, SourceFile } from '@biotool/core/domain/types';

export interface ParseRequest {
  type: 'parse';
  id: string;
  source: SourceFile;
}

export type ParseResponse =
  | { type: 'result'; id: string; protein: Protein }
  | { type: 'error'; id: string; error: { name: string; message: string } };

/** Validates the protocol envelope; the bundled worker owns the typed payload. */
export function isParseResponse(value: unknown): value is ParseResponse {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') return false;
  if (!('type' in value)) return false;
  if (value.type === 'result') {
    if (!('protein' in value) || !value.protein || typeof value.protein !== 'object') return false;
    const protein = value.protein;
    return 'chains' in protein && Array.isArray(protein.chains)
      && 'residues' in protein && Array.isArray(protein.residues)
      && 'atoms' in protein && Array.isArray(protein.atoms)
      && 'title' in protein && typeof protein.title === 'string'
      && 'modelNumber' in protein && typeof protein.modelNumber === 'string'
      && 'warnings' in protein && Array.isArray(protein.warnings);
  }
  return value.type === 'error' && 'error' in value && !!value.error && typeof value.error === 'object'
    && 'name' in value.error && typeof value.error.name === 'string'
    && 'message' in value.error && typeof value.error.message === 'string';
}
