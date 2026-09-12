// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStructure, importStructure, MAX_FILE_BYTES, readLimited, sourceDigest } from './source';

afterEach(() => vi.unstubAllGlobals());

describe('source boundaries', () => {
  it('produces a stable SHA-256 fingerprint for text and binary sources', async () => {
    const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    expect(await sourceDigest('abc')).toBe(expected);
    expect(await sourceDigest(new TextEncoder().encode('abc'))).toBe(expected);
  });

  it('cancels a stream that exceeds the byte ceiling', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(MAX_FILE_BYTES + 1)); },
      cancel,
    });
    await expect(readLimited(stream)).rejects.toThrow('20 MB');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('imports original text and BinaryCIF bytes without uploading', async () => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const text = await importStructure(new File(['data_local'], 'local.cif'));
    expect(text).toMatchObject({ data: 'data_local', format: 'mmcif', origin: 'local', filename: 'local.cif' });
    expect(text.id).toMatch(/^local-[a-f0-9]{12}$/);
    const binary = await importStructure(new File([new Uint8Array([1, 2, 3])], 'structure.bcif'));
    expect(binary.format).toBe('bcif');
    expect(binary.data).toEqual(new Uint8Array([1, 2, 3]));
    expect(network).not.toHaveBeenCalled();
  });

  it('decompresses gzip while retaining a usable decompressed filename', async () => {
    const compressed = await new Response(new Blob(['data_compressed']).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    const source = await importStructure(new File([compressed], 'EXAMPLE.CIF.GZ'));
    expect(source.filename).toBe('EXAMPLE.CIF');
    expect(source.data).toBe('data_compressed');
    expect(source.format).toBe('mmcif');
  });

  it('rejects unsupported formats and oversized local files before reading', async () => {
    await expect(importStructure(new File(['not a structure'], 'wrong.txt'))).rejects.toThrow('Choose a .pdb');
    await expect(importStructure(new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'large.pdb'))).rejects.toThrow('20 MB');
  });

  it('fetches an extended accession intact, credential-free, with a cancelable request', async () => {
    const network = vi.fn().mockResolvedValue(new Response('data_archive'));
    vi.stubGlobal('fetch', network);
    const source = await fetchStructure('pdb_1234abcd', new AbortController().signal);
    expect(network).toHaveBeenCalledWith('https://files.rcsb.org/download/pdb_1234abcd.cif', expect.objectContaining({
      credentials: 'omit', signal: expect.any(AbortSignal),
    }));
    expect(source.id).toBe('pdb_1234abcd');
    expect(source.origin).toBe('rcsb');
  });

  it('reports archive failures rather than caching error-shaped data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
    await expect(fetchStructure('1CRN', new AbortController().signal)).rejects.toThrow('structure not found');
  });
});
