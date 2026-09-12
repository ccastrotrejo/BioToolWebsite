import { describe, expect, it } from 'vitest';
import { source } from '@biotool/core/formats/fixtures/structures';
import { viewerSourceData } from './source-data';

describe('local viewer source data', () => {
  it('decodes text formats and makes a private, non-detached binary copy', () => {
    const bytes = new TextEncoder().encode('ATOM\n');
    expect(viewerSourceData(source(bytes))).toBe('ATOM\n');
    expect(viewerSourceData(source(bytes, 'mmcif'))).toBe('ATOM\n');
    const binary = viewerSourceData(source(bytes, 'bcif'));
    if (typeof binary === 'string') throw new Error('Expected a binary copy');
    expect([...binary]).toEqual([...bytes]);
    expect(binary).not.toBe(bytes);
    expect(bytes.byteLength).toBe(5);
  });

  it('rejects text masquerading as BinaryCIF and malformed UTF-8', () => {
    expect(() => viewerSourceData(source('not binary', 'bcif'))).toThrow('BinaryCIF requires binary source data');
    expect(() => viewerSourceData(source(new Uint8Array([255]), 'pdb'))).toThrow();
  });
});
