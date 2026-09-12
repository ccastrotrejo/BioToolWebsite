import type { Residue, StructureFormat } from '../domain/types';

export interface AtomResidueIdentity {
  authChain: string;
  labelChain: string;
  authSeq: string;
  labelSeq: string | null;
  insertion: string;
}

function normalize(value: string | null): string {
  return value?.trim() ?? '';
}

function authIdentity(identity: AtomResidueIdentity): string {
  return JSON.stringify([
    normalize(identity.authChain),
    normalize(identity.authSeq),
    normalize(identity.insertion),
  ]);
}

function labelIdentity(identity: AtomResidueIdentity): string {
  return JSON.stringify([
    normalize(identity.labelChain),
    normalize(identity.labelSeq),
    normalize(identity.insertion),
  ]);
}

/**
 * Match observed residues without interpreting application keys. PDB has no label
 * chain namespace, so only that format allows Mol*'s generated labels to differ.
 * Ambiguous identities deliberately remain unlinked.
 */
export function createResidueResolver(residues: readonly Residue[], format: StructureFormat) {
  const byAuth = new Map<string, Residue[]>();
  const missingAuth = new Map<string, Residue[]>();
  for (const residue of residues) {
    const identity = authIdentity(residue);
    const matches = byAuth.get(identity);
    if (matches) matches.push(residue);
    else byAuth.set(identity, [residue]);
    if (!normalize(residue.authSeq) && normalize(residue.labelSeq)) {
      const label = labelIdentity(residue);
      const matches = missingAuth.get(label) ?? [];
      matches.push(residue);
      missingAuth.set(label, matches);
    }
  }

  return (identity: AtomResidueIdentity, isFirstModel: boolean): Residue | undefined => {
    if (!isFirstModel) return undefined;
    const candidates = byAuth.get(authIdentity(identity)) ?? [];
    const exact = candidates.filter(residue =>
      normalize(residue.labelChain) === normalize(identity.labelChain)
      && (format === 'pdb' || normalize(residue.labelSeq) === normalize(identity.labelSeq)));
    if (exact.length === 1) return exact[0];
    if (format === 'pdb' && candidates.length === 1) return candidates[0];
    if (format !== 'pdb') {
      const fallback = (missingAuth.get(labelIdentity(identity)) ?? []).filter(residue =>
        normalize(residue.authChain) === normalize(identity.authChain));
      if (fallback.length === 1) return fallback[0];
    }
    return undefined;
  };
}
