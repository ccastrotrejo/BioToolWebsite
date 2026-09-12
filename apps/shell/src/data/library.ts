import type { SourceFile } from '@biotool/core/domain/types';

export interface SavedStructure {
  source: SourceFile;
  title: string;
  residueCount: number;
}

const DATABASE = 'biotool-library-v1';
const STORE = 'structures';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'source.id' });
    request.onerror = () => reject(request.error ?? new Error('Could not open the device library.'));
    request.onblocked = () => reject(new Error('Close other BioTool tabs to update the device library.'));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function transaction<T>(
  mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const request = operation(tx.objectStore(STORE));
    tx.oncomplete = () => { database.close(); resolve(request.result); };
    tx.onabort = () => { database.close(); reject(tx.error ?? new Error('The library update was interrupted.')); };
    tx.onerror = () => { database.close(); reject(tx.error ?? new Error('Could not access the device library.')); };
  });
}

function isSavedStructure(value: unknown): value is SavedStructure {
  if (typeof value !== 'object' || value === null || !('source' in value)) return false;
  const source = value.source;
  return typeof source === 'object' && source !== null
    && 'id' in source && typeof source.id === 'string'
    && 'filename' in source && typeof source.filename === 'string'
    && 'format' in source && ['pdb', 'mmcif', 'bcif'].includes(String(source.format))
    && 'origin' in source && ['rcsb', 'local', 'example'].includes(String(source.origin))
    && 'data' in source && (typeof source.data === 'string' || (
      ArrayBuffer.isView(source.data) && Object.prototype.toString.call(source.data) === '[object Uint8Array]'
    ))
    && 'fetchedAt' in source && typeof source.fetchedAt === 'string'
    && 'title' in value && typeof value.title === 'string'
    && 'residueCount' in value && typeof value.residueCount === 'number';
}

export async function listSaved(): Promise<SavedStructure[]> {
  const records: unknown[] = await transaction('readonly', (store) => store.getAll());
  if (!records.every(isSavedStructure)) throw new Error('A saved library record is incompatible. Clear the device library to recover.');
  return records.sort((a, b) => b.source.fetchedAt.localeCompare(a.source.fetchedAt));
}

export async function getSaved(id: string): Promise<SavedStructure | undefined> {
  const record: unknown = await transaction('readonly', (store) => store.get(id));
  if (record === undefined) return undefined;
  if (!isSavedStructure(record)) throw new Error(`The saved copy of ${id} is incompatible. Remove it or refresh from RCSB.`);
  return record;
}

export async function saveStructure(record: SavedStructure): Promise<void> {
  await transaction('readwrite', (store) => store.put(record));
}

export async function removeSaved(id: string): Promise<void> {
  await transaction('readwrite', (store) => store.delete(id));
}

export async function clearLibrary(): Promise<void> {
  await transaction('readwrite', (store) => store.clear());
}
