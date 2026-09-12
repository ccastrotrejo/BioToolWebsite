import { describe, expect, it } from 'vitest';
import { CIF } from 'molstar/lib/mol-io/reader/cif';
import { parsePDB } from 'molstar/lib/mol-io/reader/pdb/parser';
import { trajectoryFromMmCIF } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { trajectoryFromPDB } from 'molstar/lib/mol-model-formats/structure/pdb';
import { Structure, StructureElement } from 'molstar/lib/mol-model/structure';
import { to_mmCIF } from 'molstar/lib/mol-model/structure/export/mmcif';
import { Task } from 'molstar/lib/mol-task';
import { parseStructure } from '@biotool/core/formats/parse';
import { cifRow, mmcif, pdbAtom, source } from '@biotool/core/formats/fixtures/structures';
import { ResidueMap } from './residue-map';
import { createPropensityTheme, propensityColors, unknownColor } from './propensity-theme';

async function cifTrajectory(text: string) {
  const parsed = await CIF.parseText(text).run();
  if (parsed.isError) throw new Error(parsed.message);
  const block = parsed.result.blocks[0];
  if (!block) throw new Error('Missing test CIF block');
  return trajectoryFromMmCIF(block).run();
}

describe('real Mol* residue mapping', () => {
  it('round-trips auth chains, label chains, insertions, and non-default first models', async () => {
    const text = mmcif([
      cifRow({ id: '1', auth_seq_id: '42', pdbx_PDB_model_num: '2' }),
      cifRow({ id: '2', auth_seq_id: '42', label_seq_id: '2', pdbx_PDB_ins_code: 'A', pdbx_PDB_model_num: '2' }),
      cifRow({ id: '3', label_asym_id: 'L2', auth_seq_id: '42', pdbx_PDB_model_num: '2' }),
      cifRow({ id: '4', auth_asym_id: 'B', label_asym_id: 'L3', auth_seq_id: '42', pdbx_PDB_model_num: '2' }),
      cifRow({ id: '5', auth_seq_id: '42', pdbx_PDB_model_num: '3' }),
    ]);
    const protein = await parseStructure(source(text, 'mmcif'));
    const trajectory = await cifTrajectory(text);
    const model = await Task.resolveInContext(trajectory.getFrameAtIndex(0));
    const structure = Structure.ofModel(model);
    const mapping = new ResidueMap(structure, protein, 'mmcif');
    expect(model.modelNum).toBe(2);
    expect(mapping.residues.size).toBe(4);
    for (const residue of protein.residues) {
      const loci = mapping.lociForKeys([residue.key], null);
      expect(StructureElement.Loci.size(loci)).toBe(1);
      expect(mapping.keysFromLoci(loci, null)).toEqual([residue.key]);
      const filtered = StructureElement.Loci.fromExpression(structure, mapping.polymerExpression(residue.chainKey));
      expect(new Set(mapping.keysFromLoci(filtered, null))).toEqual(
        new Set(protein.residues.filter(other => other.chainKey === residue.chainKey).map(other => other.key)),
      );
    }
    const laterModel = await Task.resolveInContext(trajectory.getFrameAtIndex(1));
    expect(mapping.keysFromLoci(StructureElement.Loci.all(Structure.ofModel(laterModel)), null)).toEqual([]);
    expect(mapping.lociForKeys(['not a residue'], null).elements).toEqual([]);
  });

  it('links full PDB residues and all alternate atoms, but not unobserved residues or ligands', async () => {
    const text = [
      pdbAtom({ serial: 1, name: 'N', chain: ' ', position: 42 }),
      pdbAtom({ serial: 2, name: 'CA', chain: ' ', position: 42, alternate: 'A' }),
      pdbAtom({ serial: 3, name: 'CA', chain: ' ', position: 42, alternate: 'B' }),
      pdbAtom({ serial: 4, name: 'CA', chain: ' ', position: 42, insertion: 'A' }),
      pdbAtom({ serial: 5, name: 'N', chain: ' ', position: 43 }),
      pdbAtom({ serial: 6, name: 'C1', chain: ' ', position: 44, record: 'HETATM', residue: 'LIG' }),
      'END',
    ].join('\n');
    const protein = await parseStructure(source(text));
    const parsed = await parsePDB(text).run();
    if (parsed.isError) throw new Error(parsed.message);
    const trajectory = await trajectoryFromPDB(parsed.result).run();
    const structure = Structure.ofModel(await Task.resolveInContext(trajectory.getFrameAtIndex(0)));
    const mapping = new ResidueMap(structure, protein, 'pdb');
    expect(structure.elementCount).toBe(6);
    expect(mapping.residues.size).toBe(2);
    const first = protein.residues[0];
    if (!first) throw new Error('Missing first test residue');
    expect(StructureElement.Loci.size(mapping.lociForKeys([first.key], null))).toBe(3);
    expect(mapping.keysFromLoci(StructureElement.Loci.all(structure), null)).toEqual(protein.residues.map(residue => residue.key));
    expect(mapping.lociForKeys([first.key], 'another chain').elements).toEqual([]);
  });

  it('colors triplet propensity independently of cartoon geometry, leaving the tail gray', async () => {
    const text = mmcif([1, 2, 3, 4].map(index => cifRow({
      id: String(index), auth_seq_id: String(index), label_seq_id: String(index),
      Cartn_x: String(index * 3.8), Cartn_y: '0', Cartn_z: '0',
    })));
    const protein = await parseStructure(source(text, 'mmcif'));
    const trajectory = await cifTrajectory(text);
    const structure = Structure.ofModel(await Task.resolveInContext(trajectory.getFrameAtIndex(0)));
    const mapping = new ResidueMap(structure, protein, 'mmcif');
    const theme = createPropensityTheme(protein, mapping).factory({ structure }, {});
    if (!('color' in theme)) throw new Error('Expected a per-residue color theme');
    const colors = protein.residues.map(residue => {
      const location = StructureElement.Loci.getFirstLocation(mapping.lociForKeys([residue.key], null));
      if (!location) throw new Error('Unmapped test residue');
      return theme.color(location, false);
    });
    expect(colors).toEqual([propensityColors.alpha, propensityColors.alpha, propensityColors.alpha, unknownColor]);
  });

  it('loads complete BinaryCIF coordinates and preserves mapped identities', async () => {
    const text = mmcif([1, 2, 3].map(index => cifRow({
      id: String(index), auth_seq_id: String(index + 40), label_seq_id: String(index),
      Cartn_x: String(index * 3.8), Cartn_y: '0', Cartn_z: '0',
    })));
    const original = await cifTrajectory(text);
    const originalStructure = Structure.ofModel(await Task.resolveInContext(original.getFrameAtIndex(0)));
    const bytes = to_mmCIF('local', originalStructure, true);
    if (typeof bytes === 'string') throw new Error('Expected BinaryCIF bytes');
    const protein = await parseStructure(source(bytes, 'bcif'));
    const parsed = await CIF.parseBinary(bytes).run();
    if (parsed.isError) throw new Error(parsed.message);
    const block = parsed.result.blocks[0];
    if (!block) throw new Error('Missing BinaryCIF block');
    const trajectory = await trajectoryFromMmCIF(block).run();
    const structure = Structure.ofModel(await Task.resolveInContext(trajectory.getFrameAtIndex(0)));
    const mapping = new ResidueMap(structure, protein, 'bcif');
    expect(structure.elementCount).toBe(3);
    expect(mapping.keysFromLoci(StructureElement.Loci.all(structure), null)).toEqual(protein.residues.map(residue => residue.key));
    expect(mapping.residues.size).toBe(3);
  });

  it('maps CIF residues with missing author sequence numbers through label identities', async () => {
    const text = mmcif([
      cifRow({ id: '1', auth_seq_id: '?', label_seq_id: '1' }),
      cifRow({ id: '2', auth_seq_id: '?', label_seq_id: '2' }),
    ]);
    const protein = await parseStructure(source(text, 'mmcif'));
    const trajectory = await cifTrajectory(text);
    const structure = Structure.ofModel(await Task.resolveInContext(trajectory.getFrameAtIndex(0)));
    const mapping = new ResidueMap(structure, protein, 'mmcif');
    expect(mapping.keysFromLoci(StructureElement.Loci.all(structure), null)).toEqual(protein.residues.map(residue => residue.key));
  });

  it('preserves nonnumeric source author sequence IDs rather than Mol* integer coercions', async () => {
    const text = mmcif([
      cifRow({ id: '1', auth_seq_id: 'R42', label_seq_id: '1' }),
      cifRow({ id: '2', auth_seq_id: 'R43', label_seq_id: '2' }),
    ]);
    const protein = await parseStructure(source(text, 'mmcif'));
    const trajectory = await cifTrajectory(text);
    const structure = Structure.ofModel(await Task.resolveInContext(trajectory.getFrameAtIndex(0)));
    const mapping = new ResidueMap(structure, protein, 'mmcif');
    expect(mapping.residues.size).toBe(2);
    for (const residue of protein.residues) {
      const loci = mapping.lociForKeys([residue.key], null);
      expect(StructureElement.Loci.size(loci)).toBe(1);
      expect(mapping.keysFromLoci(loci, null)).toEqual([residue.key]);
    }
  });

  it('keeps nonnumeric PDB author IDs distinct even if the hierarchy merges their residue indices', async () => {
    const text = [
      pdbAtom({ serial: 1, position: 'A000' }),
      pdbAtom({ serial: 2, position: 'A001', point: [1, 2, 3] }),
    ].join('\n');
    const protein = await parseStructure(source(text));
    const parsed = await parsePDB(text).run();
    if (parsed.isError) throw new Error(parsed.message);
    const trajectory = await trajectoryFromPDB(parsed.result).run();
    const structure = Structure.ofModel(await Task.resolveInContext(trajectory.getFrameAtIndex(0)));
    const mapping = new ResidueMap(structure, protein, 'pdb');
    expect(mapping.residues.size).toBe(2);
    for (const residue of protein.residues) {
      const loci = mapping.lociForKeys([residue.key], null);
      expect(StructureElement.Loci.size(loci)).toBe(1);
      expect(mapping.keysFromLoci(loci, null)).toEqual([residue.key]);
    }
  });
});
