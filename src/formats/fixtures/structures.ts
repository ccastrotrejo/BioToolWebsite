import type { SourceFile } from '../../domain/types';

interface PdbAtomOptions {
  serial?: number;
  name?: string;
  residue?: string;
  chain?: string;
  position?: number | string;
  point?: [number, number, number];
  record?: string;
  alternate?: string;
  insertion?: string;
}

export function pdbAtom({
  serial = 1, name = 'CA', residue = 'ALA', chain = 'A', position = 1,
  point = [-123.456, 1234.567, -987.654], record = 'ATOM', alternate = ' ', insertion = ' ',
}: PdbAtomOptions = {}): string {
  return `${record.padEnd(6)}${String(serial).padStart(5)} ${name.padStart(3).padEnd(4)}`
    + `${alternate}${residue.padStart(3)} ${chain}${String(position).padStart(4)}${insertion}   `
    + point.map((value) => value.toFixed(3).padStart(8)).join('')
    + '  1.00 20.00           C';
}

export function source(data: string | Uint8Array, format: SourceFile['format'] = 'pdb'): SourceFile {
  return {
    id: '1ABC', filename: `1ABC.${format}`, format, data, origin: 'local',
    fetchedAt: '2026-09-12T00:00:00.000Z',
  };
}

export const cifFields = [
  'group_PDB', 'id', 'type_symbol', 'label_atom_id', 'label_alt_id', 'label_comp_id',
  'label_asym_id', 'label_entity_id', 'label_seq_id', 'pdbx_PDB_ins_code',
  'Cartn_x', 'Cartn_y', 'Cartn_z', 'occupancy', 'B_iso_or_equiv',
  'auth_seq_id', 'auth_comp_id', 'auth_asym_id', 'auth_atom_id', 'pdbx_PDB_model_num',
] as const;

export type CifRow = Record<(typeof cifFields)[number], string>;

export function cifRow(overrides: Partial<CifRow> = {}): CifRow {
  return {
    group_PDB: 'ATOM', id: '1', type_symbol: 'C', label_atom_id: 'CA', label_alt_id: '.',
    label_comp_id: 'ALA', label_asym_id: 'L1', label_entity_id: '1',
    label_seq_id: '1', pdbx_PDB_ins_code: '?',
    Cartn_x: '-123.456', Cartn_y: '1234.567', Cartn_z: '-987.654',
    occupancy: '1', B_iso_or_equiv: '20',
    auth_seq_id: '1', auth_comp_id: 'ALA', auth_asym_id: 'A', auth_atom_id: 'CA',
    pdbx_PDB_model_num: '1', ...overrides,
  };
}

export function mmcif(rows: CifRow[], title = 'Example protein'): string {
  return `data_example\n_struct.title\n;${title}\n;\nloop_\n`
    + cifFields.map((field) => `_atom_site.${field}`).join('\n') + '\n'
    + rows.map((row) => cifFields.map((field) => row[field]).join(' ')).join('\n') + '\n#\n';
}
