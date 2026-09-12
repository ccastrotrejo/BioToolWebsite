import { afterEach, describe, expect, it, vi } from 'vitest';
import { cifRow, mmcif, pdbAtom, source } from '../formats/fixtures/structures';
import type { ParseRequest, ParseResponse } from './protocol';

afterEach(() => vi.unstubAllGlobals());

describe('async worker entry protocol', () => {
  it('parses PDB/mmCIF and returns correlated success and error responses', async () => {
    let listener: ((event: MessageEvent<ParseRequest>) => void) | undefined;
    const post = vi.fn<(response: ParseResponse) => void>();
    vi.stubGlobal('addEventListener', (type: string, handler: (event: MessageEvent<ParseRequest>) => void) => {
      if (type === 'message') listener = handler;
    });
    vi.stubGlobal('postMessage', post);
    await import('./analysis.worker');
    expect(listener).toBeTypeOf('function');
    listener!(new MessageEvent('message', { data: { type: 'parse', id: 'pdb', source: source(pdbAtom()) } }));
    listener!(new MessageEvent('message', { data: {
      type: 'parse', id: 'cif', source: source(mmcif([cifRow()]), 'mmcif'),
    } }));
    listener!(new MessageEvent('message', { data: { type: 'parse', id: 'bad', source: source('ATOM') } }));
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    const results = post.mock.calls.map(([response]) => response);
    expect(results).toContainEqual(expect.objectContaining({ type: 'result', id: 'pdb' }));
    expect(results).toContainEqual(expect.objectContaining({ type: 'result', id: 'cif' }));
    expect(results).toContainEqual({
      type: 'error', id: 'bad', error: { name: 'Error', message: 'Incomplete coordinate record on line 1.' },
    });
    for (const result of results) {
      if (result.type === 'result') expect(result.protein.chains[0]?.sequence).toBe('A');
    }
  });
});
