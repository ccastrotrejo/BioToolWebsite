import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { LibraryModuleBoundary } from './features/LibraryModuleBoundary';
import type { SavedStructure } from './data/library';
import { App } from './App';
import { useWorkbench } from './features/useWorkbench';
import { clearLibrary, removeSaved } from './data/library';

const boundary = vi.hoisted(() => vi.fn<(props: ComponentProps<typeof LibraryModuleBoundary>) => null>(() => null));
vi.mock('./features/LibraryModuleBoundary', () => ({ LibraryModuleBoundary: boundary }));
vi.mock('./features/useWorkbench');
vi.mock('./features/useOffline', () => ({ useOffline: () => ({ online: true, state: 'ready' }) }));
vi.mock('./data/library', () => ({ clearLibrary: vi.fn(), removeSaved: vi.fn() }));

const saved: SavedStructure = {
  source: { id: 'local-private', filename: 'private.pdb', format: 'pdb', data: 'private coordinates',
    origin: 'local', fetchedAt: '2026-01-01T00:00:00Z', digest: 'private-digest' },
  title: 'Private structure', residueCount: 6,
};
function currentBoundary() {
  return boundary.mock.calls.at(-1)![0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useWorkbench).mockReturnValue({
    workspace: null, saved: [saved], busy: false, status: '', error: null, retryId: null,
    setError: vi.fn(), loadPublic: vi.fn(), loadSaved: vi.fn(), loadFile: vi.fn(), cancel: vi.fn(), refreshLibrary: vi.fn(),
  });
});

describe('shell library authority', () => {
  it('sends only display metadata across the framework boundary', () => {
    render(<App />);
    const snapshot = currentBoundary().snapshot;
    expect(snapshot.saved).toEqual([{ id: 'local-private', filename: 'private.pdb', label: 'private.pdb', residueCount: 6 }]);
    expect(snapshot.saved[0]).not.toBe(saved);
    expect(JSON.stringify(snapshot)).not.toContain('private coordinates');
    expect(JSON.stringify(snapshot)).not.toContain('private-digest');
    expect(snapshot.catalog).toHaveLength(7);
    expect(snapshot.currentId).toBeNull();
  });

  it('resolves saved identifiers in React and reports a missing source explicitly', () => {
    render(<App />);
    const host = currentBoundary().host;
    act(() => host.openSaved('local-private'));
    expect(useWorkbench().loadSaved).toHaveBeenCalledWith(saved.source);
    act(() => host.openSaved('removed'));
    expect(useWorkbench().loadSaved).toHaveBeenCalledOnce();
    expect(useWorkbench().setError).toHaveBeenCalledWith(expect.stringContaining('no longer in the device library'));
  });

  it('owns deletion, clear confirmation and import input activation', async () => {
    const view = render(<App />);
    const host = currentBoundary().host;
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    act(() => host.requestImport());
    expect(click).toHaveBeenCalledOnce();
    await act(async () => host.removeSaved('local-private'));
    expect(removeSaved).toHaveBeenCalledWith('local-private');
    expect(useWorkbench().refreshLibrary).toHaveBeenCalledOnce();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await act(async () => host.clearSaved());
    expect(clearLibrary).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => host.clearSaved());
    expect(clearLibrary).toHaveBeenCalledOnce();
    expect(useWorkbench().refreshLibrary).toHaveBeenCalledTimes(2);
    expect(view.container.querySelectorAll('input[type="file"]')).toHaveLength(1);
  });
});
