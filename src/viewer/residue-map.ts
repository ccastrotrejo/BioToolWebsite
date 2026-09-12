import { OrderedSet } from 'molstar/lib/mol-data/int';
import type { CifField } from 'molstar/lib/mol-io/reader/cif/data-model';
import type { Loci } from 'molstar/lib/mol-model/loci';
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';
import {
  Bond, Structure, StructureElement, StructureProperties, Unit,
} from 'molstar/lib/mol-model/structure';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import type { Expression } from 'molstar/lib/mol-script/language/expression';
import type { Protein, Residue, StructureFormat } from '../domain/types';
import { createResidueResolver } from './identity';

function sourceIdentifier(field: CifField | undefined, row: number, fallback: string): string {
  if (!field) return fallback;
  return field.valueKind(row) === 0 ? field.str(row).trim() : '';
}

/** One map shared by picking, external highlighting, chain filtering, and coloring. */
export class ResidueMap {
  readonly residues = new Map<string, Residue>();
  private readonly atomResidues = new Map<number, Residue>();
  private readonly byKey = new Map<string, StructureElement.Loci.Element[]>();
  private readonly chains = new Map<string, Map<string, [string, string]>>();

  constructor(readonly structure: Structure, protein: Protein, format: StructureFormat) {
    const resolve = createResidueResolver(protein.residues, format);
    const firstModel = structure.models[0];
    const location = StructureElement.Location.create(structure);
    const atomSite = MmcifFormat.is(firstModel?.sourceData)
      ? firstModel.sourceData.data.frame.categories.atom_site : undefined;
    const authChainField = atomSite?.getField('auth_asym_id');
    const labelChainField = atomSite?.getField('label_asym_id');
    const authSeqField = atomSite?.getField('auth_seq_id');
    const labelSeqField = atomSite?.getField('label_seq_id');
    const insertionField = atomSite?.getField('pdbx_PDB_ins_code');

    for (const { unit, indices } of StructureElement.Loci.all(structure).elements) {
      if (!Unit.isAtomic(unit) || unit.model !== firstModel) continue;
      const groups = new Map<string, StructureElement.UnitIndex[]>();
      OrderedSet.forEach(indices, index => {
        const element = unit.elements[index];
        if (element === undefined) return;
        StructureElement.Location.set(location, structure, unit, element);
        // The atomic hierarchy coerces sequence IDs to integers. Read the raw
        // source row instead so nonnumeric author IDs never collapse to 0.
        const row = unit.model.atomicHierarchy.atomSourceIndex.value(element);
        const residue = this.atomResidues.get(element) ?? resolve({
          authChain: sourceIdentifier(authChainField, row, StructureProperties.chain.auth_asym_id(location)),
          labelChain: sourceIdentifier(labelChainField, row, StructureProperties.chain.label_asym_id(location)),
          authSeq: sourceIdentifier(authSeqField, row, String(StructureProperties.residue.auth_seq_id(location))),
          labelSeq: sourceIdentifier(labelSeqField, row, String(StructureProperties.residue.label_seq_id(location))) || null,
          insertion: sourceIdentifier(insertionField, row, StructureProperties.residue.pdbx_PDB_ins_code(location)),
        }, true);
        if (!residue) return;
        this.atomResidues.set(element, residue);
        this.residues.set(residue.key, residue);
        const chain: [string, string] = [
          StructureProperties.chain.auth_asym_id(location),
          StructureProperties.chain.label_asym_id(location),
        ];
        const chains = this.chains.get(residue.chainKey) ?? new Map();
        chains.set(JSON.stringify(chain), chain);
        this.chains.set(residue.chainKey, chains);
        const group = groups.get(residue.key);
        if (group) group.push(index);
        else groups.set(residue.key, [index]);
      });
      for (const [key, atomIndices] of groups) {
        const elements = this.byKey.get(key) ?? [];
        elements.push({ unit, indices: OrderedSet.ofSortedArray(atomIndices) });
        this.byKey.set(key, elements);
      }
    }
  }

  residueAt(location: StructureElement.Location): Residue | undefined {
    if (!Unit.isAtomic(location.unit) || location.unit.model !== this.structure.models[0]) return undefined;
    return this.atomResidues.get(location.element);
  }

  keysFromLoci(loci: Loci, chainKey: string | null): string[] {
    const elements = Bond.isLoci(loci) ? Bond.toStructureElementLoci(loci) : loci;
    if (!StructureElement.Loci.is(elements)) return [];
    const keys = new Set<string>();
    StructureElement.Loci.forEachLocation(elements, location => {
      const residue = this.residueAt(location);
      if (residue && (chainKey === null || residue.chainKey === chainKey)) keys.add(residue.key);
    });
    return [...keys];
  }

  lociForKeys(keys: readonly string[], chainKey: string | null): StructureElement.Loci {
    const units = new Map<Unit, StructureElement.UnitIndex[]>();
    for (const key of new Set(keys)) {
      for (const entry of this.byKey.get(key) ?? []) {
        if (chainKey !== null) {
          const first = StructureElement.Loci.getFirstLocation(StructureElement.Loci(this.structure, [entry]));
          if (!first || this.residueAt(first)?.chainKey !== chainKey) continue;
        }
        const indices = units.get(entry.unit) ?? [];
        OrderedSet.forEach(entry.indices, index => { indices.push(index); });
        units.set(entry.unit, indices);
      }
    }
    return StructureElement.Loci(this.structure, [...units].map(([unit, indices]) => ({
      unit,
      indices: OrderedSet.ofSortedArray(indices.sort((a, b) => a - b)),
    })));
  }

  polymerExpression(chainKey: string | null): Expression {
    const chains = chainKey === null ? [] : [...(this.chains.get(chainKey)?.values() ?? [])];
    return MS.struct.generator.atomGroups({
      'entity-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.entityType(), 'polymer']),
      'chain-test': chainKey === null ? true : chains.length === 0 ? false
        : MS.core.logic.or(chains.map(([auth, label]) => MS.core.logic.and([
          MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(), auth]),
          MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_asym_id(), label]),
        ]))),
    });
  }
}
