import type { SourceFile } from '../domain/types';

/** Feed Mol* the declared format without transferring or mutating the private source buffer. */
export function viewerSourceData(source: SourceFile): string | Uint8Array<ArrayBuffer> {
  if (source.format === 'bcif') {
    if (typeof source.data === 'string') throw new Error('BinaryCIF requires binary source data.');
    return new Uint8Array(source.data);
  }
  return typeof source.data === 'string' ? source.data
    : new TextDecoder('utf-8', { fatal: true }).decode(source.data);
}
