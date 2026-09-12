/**
 * A model and both chain namespaces identify a chain; author IDs alone are not unique.
 * Missing IDs are normalized to ''. PDB uses authChain for labelChain as well.
 */
export function makeChainKey(modelNumber: string, authChain: string, labelChain: string): string {
  return JSON.stringify([modelNumber, authChain, labelChain]);
}

/**
 * Preserve author sequence strings (including nonnumeric IDs) and insertion codes.
 * Missing insertion/authSeq use ''; unavailable labelSeq (including PDB) uses null.
 */
export function makeResidueKey(
  chainKey: string,
  authSeq: string,
  insertion: string,
  labelSeq: string | null = null,
): string {
  return JSON.stringify([chainKey, authSeq, insertion, labelSeq]);
}
