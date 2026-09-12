/** Normalize archive identifiers without truncating extended IDs. */
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
