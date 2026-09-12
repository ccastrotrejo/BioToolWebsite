import { parseCifText } from 'molstar/lib/mol-io/reader/cif/text/parser';
import { parseCifBinary } from 'molstar/lib/mol-io/reader/cif/binary/parser';
import type { CifCategory } from 'molstar/lib/mol-io/reader/cif/data-model';
import type { AminoAcid, Atom, Chain, Point3, Protein, Residue, SourceFile } from '../domain/types';
import { AMINO_ACIDS } from '../analysis/constants';
import { makeChainKey, makeResidueKey } from './identity';

export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
/** Raw atom records, including alternate sites and models retained in the viewer source. */
export const MAX_ATOMS = 100_000;

const aminoByName = new Map<string, AminoAcid>(AMINO_ACIDS.map((amino) => [amino.three, amino.code]));
aminoByName.set('MSE', 'M');
const numericPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

interface AtomSite {
  authChain: string;
  labelChain: string;
  authSeq: string;
  labelSeq: string | null;
  insertion: string;
  residueName: string;
  atomName: string;
  alternate: string;
  element: string;
  occupancy: number | null;
  bFactor: number | null;
}

interface SelectedSite extends AtomSite {
  chainKey: string;
  residueKey: string;
  priority: number;
  position: Point3;
}

function alternatePriority(alternate: string): number {
  return alternate === '' ? 0 : alternate === 'A' ? 1 : 2;
}

function coordinate(value: string, location: string): number {
  if (/^[+-]?(?:nan|inf(?:inity)?)$/i.test(value)) {
    throw new Error(`Non-finite coordinates on ${location}.`);
  }
  if (!numericPattern.test(value)) throw new Error(`Invalid coordinates on ${location}.`);
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Non-finite coordinates on ${location}.`);
  return result;
}

function optionalNumber(value: string): number | null {
  const result = numericPattern.test(value) ? Number(value) : NaN;
  return Number.isFinite(result) ? result : null;
}

function inferredElement(atomName: string): string {
  return atomName.replace(/^[0-9]+/, '').slice(0, 1).toUpperCase();
}

function sequenceNumber(residue: Residue): number | null {
  const value = residue.labelSeq ?? residue.authSeq;
  if (!/^-?\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function assertAtomLimit(count: number): void {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid atom-record count.');
  if (count > MAX_ATOMS) {
    throw new Error(`The source exceeds the ${MAX_ATOMS.toLocaleString('en-US')} atom-record limit.`);
  }
}

class StructureBuilder {
  modelNumber = '1';
  private sites = new Map<string, SelectedSite>();
  private excludedCount = 0;

  acceptRecord(record: string, residueName: string): boolean {
    if (record === 'HETATM' && residueName !== 'MSE') {
      this.excludedCount += 1;
      return false;
    }
    return true;
  }

  add(site: AtomSite, readPosition: () => Point3): void {
    const chainKey = makeChainKey(this.modelNumber, site.authChain, site.labelChain);
    const residueKey = makeResidueKey(chainKey, site.authSeq, site.insertion, site.labelSeq);
    const key = JSON.stringify([residueKey, site.atomName]);
    const priority = alternatePriority(site.alternate);
    const previous = this.sites.get(key);
    // Replacing a conformer must not change the site's file-encounter order.
    if (previous && previous.priority <= priority) return;
    this.sites.set(key, { ...site, chainKey, residueKey, priority, position: readPosition() });
  }

  finish(title: string, formatName: string, knownGaps = false): Protein {
    const atoms: Atom[] = [];
    const residues: Residue[] = [];
    const chains = new Map<string, Chain>();
    const indicesByResidue = new Map<string, number[]>();
    for (const site of this.sites.values()) {
      const indices = indicesByResidue.get(site.residueKey) ?? [];
      indices.push(atoms.length);
      indicesByResidue.set(site.residueKey, indices);
      atoms.push({
        name: site.atomName, element: site.element, position: site.position,
        residueKey: site.residueKey, alternate: site.alternate,
        occupancy: site.occupancy, bFactor: site.bFactor,
      });
    }
    for (const site of this.sites.values()) {
      if (site.atomName !== 'CA') continue;
      const aminoAcid = aminoByName.get(site.residueName);
      if (!aminoAcid) {
        throw new Error(
          `Unsupported residue: ${site.residueName}, chain ${site.authChain || ' '}, `
          + `position ${site.authSeq}${site.insertion}.`,
        );
      }
      let chain = chains.get(site.chainKey);
      if (!chain) {
        const label = site.authChain || site.labelChain || '(blank)';
        chain = {
          key: site.chainKey, label, authId: site.authChain, labelId: site.labelChain,
          residues: [], sequence: '',
        };
        chains.set(site.chainKey, chain);
      }
      const residue: Residue = {
        key: site.residueKey, chainKey: site.chainKey,
        authChain: site.authChain, labelChain: site.labelChain,
        authSeq: site.authSeq, labelSeq: site.labelSeq, insertion: site.insertion,
        name: site.residueName, aminoAcid, index: chain.residues.length,
        atomIndices: indicesByResidue.get(site.residueKey)!,
        ca: site.position,
      };
      residues.push(residue);
      chain.residues.push(residue);
      chain.sequence += aminoAcid;
    }
    if (!residues.length) throw new Error(`The ${formatName} file contains no amino acids with CA atoms.`);
    const labels = new Map<string, number>();
    for (const chain of chains.values()) labels.set(chain.label, (labels.get(chain.label) ?? 0) + 1);
    let hasGaps = knownGaps;
    for (const chain of chains.values()) {
      if ((labels.get(chain.label) ?? 0) > 1) chain.label += ` (label ${chain.labelId || '(blank)'})`;
      for (let index = 1; index < chain.residues.length; index += 1) {
        const previous = sequenceNumber(chain.residues[index - 1]!);
        const current = sequenceNumber(chain.residues[index]!);
        if (previous !== null && current !== null && current > previous + 1) hasGaps = true;
      }
    }
    const warnings = [
      'Triplet classes use legacy amino-acid propensities, not an experimental secondary-structure assignment.',
    ];
    if (hasGaps) {
      warnings.push('Missing-coordinate or numbering gaps are present; observed residues remain concatenated within each chain.');
    }
    const withoutCa = indicesByResidue.size - residues.length;
    if (withoutCa > 0) {
      warnings.push(`${withoutCa} residue site(s) without CA atoms contribute coordinates but not sequence or composition.`);
    }
    if (this.excludedCount > 0) {
      warnings.push(
        `${this.excludedCount} non-MSE HETATM record(s) are excluded from analysis; the original molecular source is unchanged.`,
      );
    }
    return { title, chains: [...chains.values()], residues, atoms, modelNumber: this.modelNumber, warnings };
  }
}

function parsePdb(text: string, fallbackTitle: string): Protein {
  const builder = new StructureBuilder();
  const titles: string[] = [];
  const compounds: string[] = [];
  let modelStarted = false;
  let knownGaps = false;
  const lines = text.split(/\r\n|\n|\r/);
  let recordCount = 0;
  let firstModelKnown = false;
  for (const line of lines) {
    const record = line.slice(0, 6).trim();
    if (record === 'ATOM' || record === 'HETATM') {
      recordCount += 1;
      assertAtomLimit(recordCount);
    }
    if (!firstModelKnown && (record === 'MODEL' || record === 'ENDMDL' || record === 'END')) {
      if (record === 'MODEL') builder.modelNumber = line.slice(10, 14).trim() || '1';
      firstModelKnown = true;
    }
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const record = line.slice(0, 6).trim();
    if (record === 'TITLE') titles.push(line.slice(10, 80).trim());
    else if (record === 'COMPND') compounds.push(line.slice(10, 80).trim());
    else if (record === 'MODEL') {
      if (modelStarted) break;
      modelStarted = true;
      builder.modelNumber = line.slice(10, 14).trim() || '1';
    } else if (record === 'ENDMDL' || record === 'END') break;
    else if (record === 'REMARK' && /^REMARK 465\s+\d*\s*[A-Z]{3}\s/.test(line)) knownGaps = true;
    else if (record === 'ATOM' || record === 'HETATM') {
      const residueName = line.slice(17, 20).trim();
      if (!builder.acceptRecord(record, residueName)) continue;
      const location = `line ${index + 1}`;
      if (line.length < 54) throw new Error(`Incomplete coordinate record on ${location}.`);
      const atomName = line.slice(12, 16).trim();
      const authChain = line.slice(21, 22).trim();
      builder.add({
        authChain, labelChain: authChain, residueName, atomName,
        authSeq: line.slice(22, 26).trim(), labelSeq: null,
        insertion: line.slice(26, 27).trim(), alternate: line.slice(16, 17).trim(),
        element: line.slice(76, 78).trim().toUpperCase() || inferredElement(atomName),
        occupancy: optionalNumber(line.slice(54, 60).trim()),
        bFactor: optionalNumber(line.slice(60, 66).trim()),
      }, () => [
        coordinate(line.slice(30, 38).trim(), location),
        coordinate(line.slice(38, 46).trim(), location),
        coordinate(line.slice(46, 54).trim(), location),
      ]);
    }
  }
  const title = titles.join(' ')
    || [...compounds.join(' ').matchAll(/MOLECULE:\s*([^;]+)/g)].map((match) => match[1]).join('; ')
    || fallbackTitle;
  return builder.finish(title, 'PDB', knownGaps);
}

function fieldReader(category: CifCategory) {
  const fields = new Map(category.fieldNames.map((name) => [name, category.getField(name)]));
  return (name: string, row: number): string => {
    const field = fields.get(name);
    // CIF value kinds distinguish missing values without misreading a quoted literal ".".
    return field && field.valueKind(row) === 0 ? field.str(row).trim() : '';
  };
}

async function parseCif(data: string | Uint8Array, fallbackTitle: string): Promise<Protein> {
  const formatName = typeof data === 'string' ? 'mmCIF' : 'BinaryCIF';
  const parsed = await (typeof data === 'string' ? parseCifText(data) : parseCifBinary(data)).run();
  if (parsed.isError) throw new Error(`Invalid ${formatName}: ${parsed.message}`);
  let recordCount = 0;
  for (const candidate of parsed.result.blocks) {
    const count = candidate.categories.atom_site?.rowCount ?? 0;
    assertAtomLimit(count);
    recordCount += count;
    assertAtomLimit(recordCount);
  }
  const block = parsed.result.blocks.find((candidate) => (candidate.categories.atom_site?.rowCount ?? 0) > 0);
  const atomSite = block?.categories.atom_site;
  if (!block || !atomSite) throw new Error(`The ${formatName} file contains no atom_site coordinates.`);
  const get = fieldReader(atomSite);
  const builder = new StructureBuilder();
  builder.modelNumber = get('pdbx_PDB_model_num', 0) || '1';
  for (let row = 0; row < atomSite.rowCount; row += 1) {
    if ((get('pdbx_PDB_model_num', row) || '1') !== builder.modelNumber) continue;
    const record = get('group_PDB', row);
    if (record !== 'ATOM' && record !== 'HETATM') {
      throw new Error(`Missing or unsupported atom_site.group_PDB on row ${row + 1}.`);
    }
    const residueName = get('auth_comp_id', row) || get('label_comp_id', row);
    if (!builder.acceptRecord(record, residueName)) continue;
    const atomName = get('auth_atom_id', row) || get('label_atom_id', row);
    if (!atomName) throw new Error(`Missing atom name on atom_site row ${row + 1}.`);
    builder.add({
      authChain: get('auth_asym_id', row), labelChain: get('label_asym_id', row),
      authSeq: get('auth_seq_id', row), labelSeq: get('label_seq_id', row) || null,
      insertion: get('pdbx_PDB_ins_code', row), alternate: get('label_alt_id', row),
      residueName, atomName,
      element: get('type_symbol', row).toUpperCase() || inferredElement(atomName),
      occupancy: optionalNumber(get('occupancy', row)),
      bFactor: optionalNumber(get('B_iso_or_equiv', row)),
    }, () => [
      coordinate(get('Cartn_x', row), `atom_site row ${row + 1}`),
      coordinate(get('Cartn_y', row), `atom_site row ${row + 1}`),
      coordinate(get('Cartn_z', row), `atom_site row ${row + 1}`),
    ]);
  }
  const struct = block.categories.struct;
  const entity = block.categories.entity;
  let title = struct ? fieldReader(struct)('title', 0) : '';
  if (!title && entity) {
    const read = fieldReader(entity);
    const descriptions = new Set<string>();
    for (let row = 0; row < entity.rowCount; row += 1) {
      const description = read('pdbx_description', row);
      if (description) descriptions.add(description);
    }
    title = [...descriptions].join('; ');
  }
  return builder.finish(
    title || fallbackTitle || block.header, formatName,
    (block.categories.pdbx_unobs_or_zero_occ_residues?.rowCount ?? 0) > 0,
  );
}

/**
 * Reads observed first-model protein data without altering or detaching the original source.
 * Limits cover the full source; BinaryCIF row counts are checked before decoding atom fields.
 * Residue.index is a chain-local observed offset; atomIndices address the global atoms array.
 */
export async function parseStructure(source: SourceFile): Promise<Protein> {
  const data = source.data;
  const tooLarge = typeof data === 'string'
    ? data.length > MAX_SOURCE_BYTES || new TextEncoder().encode(data).byteLength > MAX_SOURCE_BYTES
    : data.byteLength > MAX_SOURCE_BYTES;
  if (tooLarge) throw new Error('Structure source exceeds the 20 MiB size limit.');
  const fallbackTitle = source.id || source.filename;
  if (source.format === 'bcif') {
    if (typeof data === 'string') throw new Error('BinaryCIF requires binary source data.');
    return parseCif(data, fallbackTitle);
  }
  if (source.format !== 'pdb' && source.format !== 'mmcif') throw new Error('Unsupported structure format.');
  const text = typeof data === 'string' ? data : new TextDecoder('utf-8', { fatal: true }).decode(data);
  return source.format === 'pdb' ? parsePdb(text, fallbackTitle) : parseCif(text, fallbackTitle);
}
