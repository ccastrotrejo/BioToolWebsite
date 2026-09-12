/// <reference types="node" />

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CifWriter } from 'molstar/lib/mol-io/writer/cif';
import { analyzeProtein } from '../analysis/analyze';
import { makeChainKey, makeResidueKey } from './identity';
import { MAX_ATOMS, MAX_SOURCE_BYTES, parseStructure } from './parse';
import { cifFields, cifRow, mmcif, pdbAtom, source } from './fixtures/structures';
import type { CifRow } from './fixtures/structures';

function binaryCif(rows: CifRow[]): Uint8Array {
  const writer = CifWriter.createEncoder({ binary: true, encoderName: 'BioTool tests' });
  writer.startDataBlock('example');
  writer.writeCategory({
    name: 'atom_site',
    instance: () => ({
      fields: cifFields.map((field) => {
        const valueKind = (index: number) => rows[index]![field] === '.' ? 1 : rows[index]![field] === '?' ? 2 : 0;
        return ['Cartn_x', 'Cartn_y', 'Cartn_z', 'occupancy', 'B_iso_or_equiv'].includes(field)
          ? CifWriter.Field.float(field, (index: number) => Number(rows[index]![field]), { valueKind })
          : CifWriter.Field.str(field, (index: number) => rows[index]![field], { valueKind });
      }),
      source: [{ rowCount: rows.length }],
    }),
  });
  const data = writer.getData();
  if (typeof data === 'string') throw new Error('Expected BinaryCIF fixture.');
  return data;
}

describe('classic PDB parsing policy', () => {
  it('preserves every chain, signed full-width coordinates and normalized identity', async () => {
    const protein = await parseStructure(source([
      'TITLE     EXAMPLE PROTEIN',
      pdbAtom({ residue: 'ALA' }), pdbAtom({ residue: 'GLY', position: 2 }),
      pdbAtom({ chain: 'B', residue: 'VAL' }), pdbAtom({ chain: ' ', residue: 'SER' }),
      'END',
    ].join('\n')));
    expect(protein.chains.map((chain) => [chain.authId, chain.sequence])).toEqual([['A', 'AG'], ['B', 'V'], ['', 'S']]);
    expect(protein.title).toBe('EXAMPLE PROTEIN');
    expect(protein.atoms).toHaveLength(4);
    expect(protein.residues[0]).toMatchObject({
      key: makeResidueKey(makeChainKey('1', 'A', 'A'), '1', ''),
      chainKey: makeChainKey('1', 'A', 'A'), authSeq: '1', labelSeq: null,
      index: 0, atomIndices: [0], ca: [-123.456, 1234.567, -987.654],
    });
    expect(protein.chains[2]?.label).toBe('(blank)');
    expect(protein.atoms[0]).toMatchObject({ name: 'CA', element: 'C', occupancy: 1, bFactor: 20 });
  });

  it('reads only the first encountered model rather than assuming model number 1', async () => {
    const protein = await parseStructure(source([
      'MODEL        7', pdbAtom(), 'ENDMDL', 'MODEL        8',
      pdbAtom({ residue: 'UNK' }), 'ATOM', 'ENDMDL',
    ].join('\n')));
    expect(protein.modelNumber).toBe('7');
    expect(protein.chains[0]?.key).toBe(makeChainKey('7', 'A', 'A'));
    expect(protein.chains[0]?.sequence).toBe('A');
    expect(protein.atoms).toHaveLength(1);
  });

  it('also stops at another MODEL or END without requiring ENDMDL', async () => {
    for (const separator of ['MODEL        2', 'END']) {
      const protein = await parseStructure(source(`MODEL        1\n${pdbAtom()}\n${separator}\nATOM`));
      expect(protein.atoms).toHaveLength(1);
    }
  });

  it('keeps legacy deduplication even for ATOM records preceding a MODEL record', async () => {
    const protein = await parseStructure(source([
      pdbAtom(), 'MODEL        7', pdbAtom({ alternate: 'B' }), 'ENDMDL',
    ].join('\n')));
    expect(protein.modelNumber).toBe('7');
    expect(protein.atoms).toHaveLength(1);
    expect(protein.chains[0]?.key).toBe(makeChainKey('7', 'A', 'A'));
  });

  it('preserves insertion codes and nonnumeric author positions without sorting', async () => {
    const protein = await parseStructure(source([
      pdbAtom({ position: 'A10', residue: 'GLY' }),
      pdbAtom({ position: -5 }), pdbAtom({ position: -5, insertion: 'A', residue: 'VAL' }),
      pdbAtom({ position: -10, residue: 'SER' }),
    ].join('\n')));
    expect(protein.chains[0]?.sequence).toBe('GAVS');
    expect(protein.residues.map((residue) => [residue.authSeq, residue.insertion])).toEqual([
      ['A10', ''], ['-5', ''], ['-5', 'A'], ['-10', ''],
    ]);
    expect(new Set(protein.residues.map((residue) => residue.key))).toHaveLength(4);
  });

  it('indexes observed residues within each chain while keeping atom indices global', async () => {
    const protein = await parseStructure(source([
      pdbAtom({ chain: 'A', position: 10 }),
      pdbAtom({ chain: 'B', position: 30 }),
      pdbAtom({ chain: 'A', position: 20 }),
      pdbAtom({ chain: 'B', position: 30, insertion: 'A' }),
    ].join('\n')));
    expect(protein.residues.map((residue) => residue.index)).toEqual([0, 0, 1, 1]);
    expect(protein.residues.map((residue) => residue.atomIndices)).toEqual([[0], [1], [2], [3]]);
    for (const chain of protein.chains) {
      expect(chain.residues.map((residue) => residue.index)).toEqual([0, 1]);
    }
  });

  it.each([
    ['B', 'A', ' '], [' ', 'A', 'B'], ['A', ' ', 'B'], ['B', ' ', 'A'],
  ])('prefers blank over A over other conformers in order %j', async (...alternates) => {
    const points: Record<string, [number, number, number]> = { ' ': [1, 2, 3], A: [4, 5, 6], B: [7, 8, 9] };
    const protein = await parseStructure(source(alternates.map((alternate) =>
      pdbAtom({ alternate, point: points[alternate]! }),
    ).join('\n')));
    expect(protein.atoms).toHaveLength(1);
    expect(protein.atoms[0]).toMatchObject({ alternate: '', position: [1, 2, 3] });
  });

  it('prefers A over B in both orders and retains first encountered other conformer', async () => {
    for (const alternates of [['B', 'A'], ['A', 'B'], ['B', 'C'], ['C', 'B']]) {
      const protein = await parseStructure(source(alternates.map((alternate) => pdbAtom({ alternate })).join('\n')));
      expect(protein.atoms[0]?.alternate).toBe(alternates.includes('A') ? 'A' : alternates[0]);
      expect(protein.atoms).toHaveLength(1);
    }
  });

  it('chooses alternates per atom site and keeps original site encounter order', async () => {
    const protein = await parseStructure(source([
      pdbAtom({ alternate: 'B', point: [9, 9, 9] }),
      pdbAtom({ name: 'N', alternate: 'B', point: [3, 3, 3] }),
      pdbAtom({ position: 2, residue: 'VAL' }),
      pdbAtom({ alternate: 'A', point: [1, 1, 1] }),
    ].join('\n')));
    expect(protein.atoms.map((atom) => atom.name)).toEqual(['CA', 'N', 'CA']);
    expect(protein.atoms.map((atom) => atom.alternate)).toEqual(['A', 'B', '']);
    expect(protein.residues[0]?.atomIndices).toEqual([0, 1]);
    expect(protein.residues[0]?.ca).toEqual([1, 1, 1]);
    expect(protein.chains[0]?.sequence).toBe('AV');
  });

  it('maps MSE to methionine, keeps all ATOM coordinates and excludes other HETATM from analysis only', async () => {
    const original = [
      pdbAtom({ record: 'HETATM', residue: 'MSE' }),
      pdbAtom({ record: 'HETATM', residue: 'HOH', name: 'O', position: 2 }),
      pdbAtom({ name: 'N' }), pdbAtom({ name: 'N', residue: 'UNK', position: 3 }),
    ].join('\n');
    const input = source(original);
    const protein = await parseStructure(input);
    expect(protein.chains[0]?.sequence).toBe('M');
    expect(protein.residues[0]?.name).toBe('MSE');
    expect(protein.residues[0]?.atomIndices).toEqual([0, 1]);
    expect(protein.atoms).toHaveLength(3);
    expect(protein.warnings.some((warning) => warning.includes('non-MSE HETATM'))).toBe(true);
    expect(protein.warnings.some((warning) => warning.includes('without CA'))).toBe(true);
    expect(input.data).toBe(original);
  });

  it('concatenates observed residues across coordinate gaps, without inventing residues', async () => {
    const protein = await parseStructure(source([
      pdbAtom(), pdbAtom({ position: 2 }), pdbAtom({ position: 10, residue: 'VAL' }),
    ].join('\n')));
    expect(protein.chains[0]?.sequence).toBe('AAV');
    expect(analyzeProtein(protein).triplets[0]?.sequence).toBe('AAV');
    expect(protein.warnings.filter((warning) => warning.includes('gaps'))).toHaveLength(1);
    expect(new Set(protein.warnings)).toHaveLength(protein.warnings.length);
  });

  it.each([
    ['', 'The PDB file contains no amino acids with CA atoms.'],
    ['<html>Not a PDB</html>', 'The PDB file contains no amino acids with CA atoms.'],
    [pdbAtom({ residue: 'UNK' }), 'Unsupported residue: UNK, chain A, position 1.'],
    [pdbAtom({ name: 'N' }), 'The PDB file contains no amino acids with CA atoms.'],
    ['ATOM      1', 'Incomplete coordinate record on line 1.'],
    [pdbAtom().slice(0, 53), 'Incomplete coordinate record on line 1.'],
  ])('rejects unusable PDB input %j', async (text, error) => {
    await expect(parseStructure(source(text))).rejects.toThrow(error);
  });

  it.each([
    ['invalid ', 'Invalid'], ['        ', 'Invalid'], ['0x000001', 'Invalid'],
    ['     NaN', 'Non-finite'], ['Infinity', 'Non-finite'], ['    -inf', 'Non-finite'],
    ['   1e999', 'Non-finite'],
  ])('rejects coordinate field %j', async (field, error) => {
    const line = pdbAtom();
    await expect(parseStructure(source(line.slice(0, 30) + field + line.slice(38)))).rejects.toThrow(`${error} coordinates`);
  });

  it('matches legacy handling of malformed discarded lower-priority conformers', async () => {
    const bad = pdbAtom({ alternate: 'B' });
    const protein = await parseStructure(source(`${pdbAtom()}\n${bad.slice(0, 30)}invalid ${bad.slice(38)}`));
    expect(protein.atoms).toHaveLength(1);
    await expect(parseStructure(source(`${pdbAtom()}\n${bad.slice(0, 53)}`))).rejects.toThrow('Incomplete');
  });

  it('uses multiline TITLE, then COMPND molecule names, then source ID', async () => {
    const variants = [
      ['TITLE     FIRST\nTITLE    2 SECOND', 'FIRST SECOND'],
      ['COMPND    MOL_ID: 1;\nCOMPND   2 MOLECULE: TEST\nCOMPND   3 PROTEIN;', 'TEST PROTEIN'],
      ['COMPND    MOLECULE: FIRST;\nCOMPND   2 MOLECULE: SECOND;', 'FIRST; SECOND'],
      ['', '1ABC'],
    ];
    for (const [headers, expected] of variants) {
      expect((await parseStructure(source(`${headers}\n${pdbAtom()}`))).title).toBe(expected);
    }
  });
});

describe.each(['mmcif', 'bcif'] as const)('%s atom_site mapping', (format) => {
  const parse = (rows: CifRow[]) => parseStructure(source(format === 'bcif' ? binaryCif(rows) : mmcif(rows), format));

  it('keeps auth strings, both chain namespaces, insertions and selected atom indices', async () => {
    const protein = await parse([
      cifRow({ auth_seq_id: '10A', pdbx_PDB_ins_code: 'B', label_alt_id: 'B' }),
      cifRow({ id: '2', auth_seq_id: '10A', pdbx_PDB_ins_code: 'B', label_alt_id: 'A', Cartn_x: '2' }),
      cifRow({ id: '3', auth_seq_id: '10A', pdbx_PDB_ins_code: 'B', auth_atom_id: 'N', label_atom_id: 'N' }),
      cifRow({ id: '4', auth_seq_id: '10A', label_asym_id: 'L2', auth_comp_id: 'VAL', label_comp_id: 'VAL' }),
    ]);
    expect(protein.chains.map((chain) => chain.sequence)).toEqual(['A', 'V']);
    expect(protein.chains.map((chain) => chain.label)).toEqual(['A (label L1)', 'A (label L2)']);
    expect(protein.residues[0]).toMatchObject({
      key: makeResidueKey(makeChainKey('1', 'A', 'L1'), '10A', 'B', '1'),
      authChain: 'A', labelChain: 'L1', authSeq: '10A', labelSeq: '1', insertion: 'B',
      atomIndices: [0, 1], ca: [2, 1234.567, -987.654],
    });
    expect(protein.atoms[0]).toMatchObject({ alternate: 'A', occupancy: 1, bFactor: 20 });
    expect(new Set(protein.chains.map((chain) => chain.key))).toHaveLength(2);
    expect(protein.residues.map((residue) => residue.index)).toEqual([0, 0]);
  });

  it('reads the first encountered model, including interleaved rows, and ignores later invalid models', async () => {
    const protein = await parse([
      cifRow({ pdbx_PDB_model_num: '5' }),
      cifRow({ pdbx_PDB_model_num: '1', auth_comp_id: 'UNK', Cartn_x: 'NaN' }),
      cifRow({ id: '3', pdbx_PDB_model_num: '5', auth_seq_id: '2', label_seq_id: '2', auth_comp_id: 'GLY' }),
    ]);
    expect(protein.modelNumber).toBe('5');
    expect(protein.chains[0]?.sequence).toBe('AG');
    expect(protein.atoms).toHaveLength(2);
  });

  it('maps missing values without numeric coercion and falls back to label atom/residue names', async () => {
    const protein = await parse([cifRow({
      auth_seq_id: '?', label_seq_id: '9007199254740993', pdbx_PDB_ins_code: '?',
      auth_asym_id: '.', auth_comp_id: '?', auth_atom_id: '?', occupancy: '?', B_iso_or_equiv: '.',
    })]);
    expect(protein.residues[0]).toMatchObject({
      authChain: '', authSeq: '', labelSeq: '9007199254740993', insertion: '', name: 'ALA',
    });
    expect(protein.atoms[0]).toMatchObject({ alternate: '', occupancy: null, bFactor: null });
  });

  it('preserves MSE and non-CA ATOM coordinates, but excludes solvent/ligand HETATM', async () => {
    const protein = await parse([
      cifRow({ group_PDB: 'HETATM', auth_comp_id: 'MSE', label_comp_id: 'MSE' }),
      cifRow({ group_PDB: 'HETATM', auth_comp_id: 'HOH', label_comp_id: 'HOH', auth_seq_id: '2', label_seq_id: '.' }),
      cifRow({ auth_atom_id: 'N', label_atom_id: 'N', auth_seq_id: '3', label_seq_id: '3' }),
    ]);
    expect(protein.chains[0]?.sequence).toBe('M');
    expect(protein.residues[0]?.name).toBe('MSE');
    expect(protein.atoms).toHaveLength(2);
    expect(protein.warnings.some((warning) => warning.includes('HETATM'))).toBe(true);
  });

  it('keeps residue file order and concatenates numbered gaps', async () => {
    const protein = await parse([
      cifRow({ label_seq_id: '2', auth_seq_id: '20', auth_comp_id: 'VAL' }),
      cifRow({ label_seq_id: '1', auth_seq_id: '10', auth_comp_id: 'GLY' }),
      cifRow({ label_seq_id: '8', auth_seq_id: '80', auth_comp_id: 'SER' }),
    ]);
    expect(protein.chains[0]?.sequence).toBe('VGS');
    expect(protein.residues.map((residue) => residue.authSeq)).toEqual(['20', '10', '80']);
    expect(protein.warnings.some((warning) => warning.includes('gaps'))).toBe(true);
  });

  it('rejects unsupported CA residues and nonprotein files clearly', async () => {
    await expect(parse([cifRow({ auth_comp_id: 'UNK' })])).rejects.toThrow('Unsupported residue: UNK');
    await expect(parse([cifRow({ auth_atom_id: 'P', label_atom_id: 'P', auth_comp_id: 'DA' })])).rejects.toThrow('no amino acids with CA atoms');
    await expect(parse([cifRow({ group_PDB: 'HETATM', auth_comp_id: 'HOH' })])).rejects.toThrow('no amino acids with CA atoms');
  });

  it.each(['?', '.', 'NaN', 'Infinity', '-Infinity', '1e999'])('rejects missing or non-finite coordinate %j', async (Cartn_x) => {
    await expect(parse([cifRow({ Cartn_x })])).rejects.toThrow(/coordinates/);
  });
});

describe('CIF syntax, bounds and source retention', () => {
  it('parses and analyzes the bundled offline 1CRN example', async () => {
    const data = readFileSync('public/examples/1crn.cif', 'utf8');
    const protein = await parseStructure({ ...source(data, 'mmcif'), id: '1CRN', origin: 'example' });
    expect(protein.chains.map((chain) => chain.sequence)).toEqual(['TTCCPSIVARSNFNVCRLPGTPEAICATYTGCIIIPGATCPGDYAN']);
    expect(protein.residues.map((residue) => residue.index)).toEqual(Array.from({ length: 46 }, (_, index) => index));
    const analysis = analyzeProtein(protein);
    expect(analysis).toMatchObject({ residueCount: 46, chainCount: 1, atomCount: 327, tailCount: 1 });
    expect(analysis.triplets.map((triplet) => triplet.index)).toEqual(Array.from({ length: 15 }, (_, index) => index * 3));
  });

  it('uses the Molstar reader for semicolon text, quoted values and comments', async () => {
    const text = mmcif([cifRow({ auth_seq_id: "'10 A'", auth_asym_id: "'chain A'" })], 'A multiline\nprotein title')
      .replace('loop_', '# atom-site comment\nloop_');
    const protein = await parseStructure(source(text, 'mmcif'));
    expect(protein.title).toBe('A multiline\nprotein title');
    expect(protein.residues[0]?.authSeq).toBe('10 A');
    expect(protein.residues[0]?.authChain).toBe('chain A');
  });

  it('does not silently accept empty, malformed, or non-coordinate CIF', async () => {
    for (const text of ['', '<html>no</html>', 'data_empty\n_entry.id example\n', 'data_bad\nloop_\n_atom_site.id\n_atom_site.Cartn_x\n1\n']) {
      await expect(parseStructure(source(text, 'mmcif'))).rejects.toThrow(/mmCIF/);
    }
    await expect(parseStructure(source(new Uint8Array([1, 2, 3]), 'bcif'))).rejects.toThrow();
    await expect(parseStructure(source('not binary', 'bcif'))).rejects.toThrow('requires binary');
  });

  it('rejects invalid numeric text rather than letting a CIF float parser truncate it', async () => {
    for (const value of ['1oops', '0x10', "' '"]) {
      await expect(parseStructure(source(mmcif([cifRow({ Cartn_x: value })]), 'mmcif'))).rejects.toThrow('Invalid coordinates');
    }
  });

  it('decodes text byte sources and never changes or detaches source buffers', async () => {
    const pdb = new TextEncoder().encode(pdbAtom());
    expect((await parseStructure(source(pdb))).chains[0]?.sequence).toBe('A');
    expect(new TextDecoder().decode(pdb)).toBe(pdbAtom());
    const bytes = binaryCif([cifRow()]);
    const original = bytes.slice();
    await parseStructure(source(bytes, 'bcif'));
    expect(bytes).toEqual(original);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('bounds source bytes, including multibyte UTF-8 rather than just string length', async () => {
    expect(MAX_SOURCE_BYTES).toBe(20 * 1024 * 1024);
    await expect(parseStructure(source(new Uint8Array(MAX_SOURCE_BYTES + 1), 'bcif'))).rejects.toThrow('20 MiB');
    await expect(parseStructure(source('A'.repeat(MAX_SOURCE_BYTES + 1)))).rejects.toThrow('20 MiB');
    await expect(parseStructure(source('💚'.repeat(MAX_SOURCE_BYTES / 4 + 1)))).rejects.toThrow('20 MiB');
  });

  it('bounds raw source atom records before alternate or HETATM deduplication', async () => {
    expect(MAX_ATOMS).toBe(100_000);
    const text = `${pdbAtom()}\n`.repeat(MAX_ATOMS);
    expect((await parseStructure(source(text))).atoms).toHaveLength(1);
    await expect(parseStructure(source(text + pdbAtom({ record: 'HETATM', residue: 'HOH' })))).rejects.toThrow('atom-record limit');
    await expect(parseStructure(source(`MODEL        1\n${pdbAtom()}\nENDMDL\nMODEL        2\n${text}`))).rejects.toThrow('atom-record limit');
  });

  it('bounds mmCIF and compressed BinaryCIF atom rows', async () => {
    const rows = Array.from({ length: MAX_ATOMS + 1 }, () => cifRow());
    await expect(parseStructure(source(mmcif(rows), 'mmcif'))).rejects.toThrow('atom-record limit');
    await expect(parseStructure(source(binaryCif(rows), 'bcif'))).rejects.toThrow('atom-record limit');
  }, 20_000);

  it('builds collision-free keys across arbitrary model/chain/residue identifiers', () => {
    expect(makeChainKey('1', 'A:B', 'C')).not.toBe(makeChainKey('1', 'A', 'B:C'));
    expect(makeChainKey('1', 'A', 'L')).not.toBe(makeChainKey('2', 'A', 'L'));
    expect(makeResidueKey('c', '1', 'A')).not.toBe(makeResidueKey('c', '1A', ''));
    expect(makeResidueKey('c', '1', '', '2')).not.toBe(makeResidueKey('c', '1', '', '3'));
  });
});
