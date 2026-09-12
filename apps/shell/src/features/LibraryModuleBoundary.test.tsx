import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryHost, LibrarySnapshot } from '@biotool/contracts';
import { LibraryModuleBoundary } from './LibraryModuleBoundary';

const moduleState = vi.hoisted(() => ({
  version: 1, importError: false, mount: vi.fn(), update: vi.fn(), unmount: vi.fn(),
}));
vi.mock('@biotool/structure-library', () => ({
  get structureLibrary() {
    if (moduleState.importError) throw new Error('Module download failed');
    return { version: moduleState.version, mount: moduleState.mount };
  },
}));

const initial: LibrarySnapshot = { catalog: [], saved: [], currentId: null, panelOpen: true, searchOpen: false };
function makeHost(): LibraryHost {
  return { openPublic: vi.fn(), openSaved: vi.fn(), requestImport: vi.fn(), removeSaved: vi.fn(),
    clearSaved: vi.fn(), closeSearch: vi.fn(), reportError: vi.fn() };
}
function recovery(message: string, retry: () => void) {
  return <div role="alert">{message}<button onClick={retry}>Retry library</button></div>;
}

beforeEach(() => {
  vi.resetAllMocks();
  moduleState.version = 1;
  moduleState.importError = false;
  moduleState.mount.mockImplementation((container: HTMLElement) => {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Vue-owned query');
    container.append(input);
    return { update: moduleState.update, unmount: moduleState.unmount };
  });
});

describe('React to Vue lifecycle boundary', () => {
  it('updates metadata and current callbacks without replacing Vue-owned DOM', async () => {
    const host = makeHost();
    const view = render(<LibraryModuleBoundary snapshot={initial} host={host} recovery={recovery} />);
    const input = await screen.findByRole('textbox');
    await userEvent.setup().type(input, 'crambin');
    const nextHost = makeHost();
    const next = { ...initial, currentId: '1CRN', searchOpen: true };
    view.rerender(<LibraryModuleBoundary snapshot={next} host={nextHost} recovery={recovery} />);
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('crambin');
    expect(moduleState.mount).toHaveBeenCalledOnce();
    expect(moduleState.update).toHaveBeenCalledWith(next);
    const commands: LibraryHost = moduleState.mount.mock.calls[0]![2];
    commands.openPublic('1CRN');
    commands.openSaved('saved');
    commands.requestImport();
    commands.removeSaved('saved');
    commands.clearSaved();
    commands.closeSearch();
    expect(nextHost.openPublic).toHaveBeenCalledWith('1CRN');
    expect(nextHost.openSaved).toHaveBeenCalledWith('saved');
    expect(nextHost.requestImport).toHaveBeenCalledOnce();
    expect(nextHost.removeSaved).toHaveBeenCalledWith('saved');
    expect(nextHost.clearSaved).toHaveBeenCalledOnce();
    expect(nextHost.closeSearch).toHaveBeenCalledOnce();
    expect(host.openPublic).not.toHaveBeenCalled();
    view.unmount();
    commands.openPublic('stale');
    commands.requestImport();
    await act(async () => commands.reportError('stale error'));
    expect(nextHost.openPublic).toHaveBeenCalledTimes(1);
    expect(nextHost.requestImport).toHaveBeenCalledTimes(1);
    expect(nextHost.reportError).not.toHaveBeenCalled();
    expect(moduleState.unmount).toHaveBeenCalledOnce();
  });

  it('handles StrictMode and unmount before an import resolves', async () => {
    const host = makeHost();
    const first = render(<LibraryModuleBoundary snapshot={initial} host={host} recovery={recovery} />);
    first.unmount();
    await act(async () => {});
    // The abandoned first import must never mount into a detached container.
    expect(moduleState.mount).not.toHaveBeenCalled();
    const second = render(<StrictMode><LibraryModuleBoundary snapshot={initial} host={host} recovery={recovery} /></StrictMode>);
    // StrictMode double-invokes effects; exactly one library instance must survive.
    const mountNode = second.container.querySelector<HTMLElement>('.library-module-mount')!;
    const panels = () => mountNode.querySelectorAll('.library-panel').length;
    const inputs = () => mountNode.querySelectorAll('input').length;
    await waitFor(() => expect(panels() + inputs()).toBeGreaterThan(0));
    await act(async () => {});
    // A second uncleaned mount would double these; StrictMode must leave one.
    expect(panels()).toBeLessThanOrEqual(1);
    expect(inputs()).toBeLessThanOrEqual(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    second.unmount();
    expect(mountNode.querySelector('input, .library-panel')).toBeNull();
    expect(mountNode.childElementCount).toBe(0);
  });

  it('mounts the newest snapshot if props change during module loading', async () => {
    const host = makeHost();
    const view = render(<LibraryModuleBoundary snapshot={initial} host={host} recovery={recovery} />);
    const next = { ...initial, currentId: '1UBQ' };
    view.rerender(<LibraryModuleBoundary snapshot={next} host={host} recovery={recovery} />);
    await screen.findByRole('textbox');
    expect(moduleState.mount.mock.calls[0]![1]).toEqual(next);
  });

  it.each(['import', 'version', 'mount', 'update', 'runtime'] as const)('exposes %s failure and allows recovery', async (failure) => {
    const host = makeHost();
    if (failure === 'import') moduleState.importError = true;
    if (failure === 'version') moduleState.version = 2;
    if (failure === 'mount') moduleState.mount.mockImplementationOnce(() => { throw new Error('Mount failed'); });
    const view = render(<LibraryModuleBoundary snapshot={initial} host={host} recovery={recovery} />);
    if (failure === 'update' || failure === 'runtime') {
      await screen.findByRole('textbox');
      if (failure === 'update') {
        moduleState.update.mockImplementationOnce(() => { throw new Error('Update failed'); });
        view.rerender(<LibraryModuleBoundary snapshot={{ ...initial, searchOpen: true }} host={host} recovery={recovery} />);
      } else {
        const commands: LibraryHost = moduleState.mount.mock.calls[0]![2];
        await act(async () => commands.reportError('Vue render failed'));
      }
    }
    expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    moduleState.importError = false;
    moduleState.version = 1;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry library' }));
    await screen.findByRole('textbox');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not leak an instance when a host command fails during mount', async () => {
    const host = makeHost();
    vi.mocked(host.requestImport).mockImplementation(() => { throw new Error('Host failed'); });
    moduleState.mount.mockImplementationOnce((_container: HTMLElement, _snapshot: LibrarySnapshot, commands: LibraryHost) => {
      commands.requestImport();
      return { update: moduleState.update, unmount: moduleState.unmount };
    });
    render(<LibraryModuleBoundary snapshot={initial} host={host} recovery={recovery} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Host failed');
    expect(moduleState.unmount).toHaveBeenCalledOnce();
  });

  it('reports teardown errors instead of leaving stale DOM or silently swallowing them', async () => {
    const host = makeHost();
    const view = render(<LibraryModuleBoundary snapshot={initial} host={host} recovery={recovery} />);
    await screen.findByRole('textbox');
    moduleState.unmount.mockImplementationOnce(() => { throw new Error('Teardown failed'); });
    view.unmount();
    await waitFor(() => expect(host.reportError).toHaveBeenCalledWith('Library cleanup failed: Teardown failed'));
  });
});
