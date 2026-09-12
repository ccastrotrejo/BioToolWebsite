import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { within, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { createApp, nextTick } from 'vue';
import { LIBRARY_CONTRACT_VERSION, type LibraryHost, type LibraryMount, type LibrarySnapshot } from '@biotool/contracts';
import { structureLibrary } from './index';

vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>();
  return { ...vue, createApp: vi.fn(vue.createApp) };
});

const initial: LibrarySnapshot = Object.freeze({
  catalog: Object.freeze([
    Object.freeze({ id: '1CRN', name: 'Crambin', organism: 'Crambe hispanica', topic: 'A tiny plant protein' }),
    Object.freeze({ id: '1UBQ', name: 'Ubiquitin', organism: 'Homo sapiens', topic: 'A molecular tag' }),
    Object.freeze({ id: '4HHB', name: 'Hemoglobin', organism: 'Homo sapiens', topic: 'An oxygen carrier' }),
  ]),
  saved: Object.freeze([
    Object.freeze({ id: '1UBQ', filename: '1ubq.cif', label: '1UBQ', residueCount: 76 }),
    Object.freeze({ id: 'local-lab', filename: 'experiment.cif', label: 'Lab model', residueCount: 1234 }),
  ]),
  currentId: '1CRN',
  panelOpen: false,
  searchOpen: false,
});

function makeHost() {
  return {
    openPublic: vi.fn<LibraryHost['openPublic']>(),
    openSaved: vi.fn<LibraryHost['openSaved']>(),
    requestImport: vi.fn<LibraryHost['requestImport']>(),
    removeSaved: vi.fn<LibraryHost['removeSaved']>(),
    clearSaved: vi.fn<LibraryHost['clearSaved']>(),
    closeSearch: vi.fn<LibraryHost['closeSearch']>(),
    reportError: vi.fn<LibraryHost['reportError']>(),
  };
}

const handles = new Set<LibraryMount>();
const nodes = new Set<HTMLElement>();

function append<T extends HTMLElement>(element: T): T {
  document.body.append(element);
  nodes.add(element);
  return element;
}

function mountLibrary(overrides: Partial<LibrarySnapshot> = {}, host = makeHost(), container = append(document.createElement('div'))) {
  let snapshot: LibrarySnapshot = Object.freeze({ ...initial, ...overrides });
  const handle = structureLibrary.mount(container, snapshot, host);
  handles.add(handle);
  return {
    container, host, handle,
    update(patch: Partial<LibrarySnapshot>) {
      snapshot = Object.freeze({ ...snapshot, ...patch });
      handle.update(snapshot);
    },
  };
}

function getDialog(container: HTMLElement) {
  return within(container).getByRole<HTMLDialogElement>('dialog', { name: 'Open a structure' });
}

function getInput(dialog: HTMLDialogElement) {
  return within(dialog).getByRole<HTMLInputElement>('textbox', { name: 'PDB identifier or example name' });
}

let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;

beforeAll(() => {
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  // jsdom does not implement the browser top layer; keep only the native method/event contract.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true, writable: true,
    value(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true, writable: true,
    value(this: HTMLDialogElement) {
      if (!this.open) return;
      this.removeAttribute('open');
      queueMicrotask(() => this.dispatchEvent(new Event('close')));
    },
  });
});

afterEach(() => {
  for (const handle of handles) handle.unmount();
  handles.clear();
  for (const node of nodes) node.remove();
  nodes.clear();
});

afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

describe('structureLibrary mount API', () => {
  it('renders the supplied metadata, accessible markers, and original library controls', () => {
    const view = mountLibrary();
    const panel = within(view.container).getByRole('complementary', { name: 'Library' });
    const library = within(panel);
    expect(structureLibrary.version).toBe(LIBRARY_CONTRACT_VERSION);
    expect(panel).toHaveAttribute('data-framework', 'vue');
    expect(panel).toHaveAttribute('data-open', 'false');
    expect(panel).toHaveAttribute('tabindex', '0');
    expect(panel).toHaveClass('library-panel');
    expect(library.getByText('2 saved')).toBeVisible();
    expect(library.getByRole('button', { name: /1CRN.*Crambin/ })).toHaveAttribute('aria-current', 'true');
    expect(library.getByRole('button', { name: /1UBQ.*Ubiquitin/ })).not.toHaveAttribute('aria-current');
    expect(library.getByRole('img', { name: 'Bundled example' })).toHaveClass('availability');
    expect(library.getByRole('img', { name: 'Saved on this device' })).toHaveClass('is-saved');
    expect(library.getByRole('img', { name: 'Not downloaded' })).not.toHaveClass('is-saved');
    expect(library.getByRole('button', { name: /Lab model.*observed residues/ })).toBeVisible();
    expect(library.getByText(`${(1234).toLocaleString()} observed residues`)).toBeVisible();
    expect(library.getAllByRole('button', { name: /Remove .* from device library/ })).toHaveLength(1);
    expect(library.getByRole('link', { name: 'RCSB Protein Data Bank' })).toHaveAttribute('rel', 'noreferrer');
    expect(library.queryByText(/vue/i)).not.toBeInTheDocument();
    expect(view.container.querySelector('dialog')).toHaveAttribute('data-framework', 'vue');
    expect(view.container.querySelector('dialog')).not.toHaveAttribute('open');
    expect(view.host.reportError).not.toHaveBeenCalled();
  });

  it('dispatches each sidebar command exactly once using only identifiers', async () => {
    const user = userEvent.setup();
    const view = mountLibrary();
    const library = within(view.container);
    await user.click(library.getByRole('button', { name: /1CRN.*Crambin/ }));
    await user.click(library.getByRole('button', { name: /Lab model/ }));
    await user.click(library.getByRole('button', { name: 'Remove experiment.cif from device library' }));
    await user.click(library.getByRole('button', { name: 'Open a local file' }));
    library.getByRole('button', { name: 'Clear saved files' }).focus();
    await user.keyboard('{Enter}');
    expect(view.host.openPublic).toHaveBeenCalledExactlyOnceWith('1CRN');
    expect(view.host.openSaved).toHaveBeenCalledExactlyOnceWith('local-lab');
    expect(view.host.removeSaved).toHaveBeenCalledExactlyOnceWith('local-lab');
    expect(view.host.requestImport).toHaveBeenCalledExactlyOnceWith();
    expect(view.host.clearSaved).toHaveBeenCalledExactlyOnceWith();
    expect(view.host.closeSearch).not.toHaveBeenCalled();
  });

  it('updates metadata, current and saved markers, and mobile state without replacing components or losing query/focus', async () => {
    const user = userEvent.setup();
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const view = mountLibrary({ searchOpen: true });
    const panel = within(view.container).getByRole('complementary', { name: 'Library' });
    const dialog = getDialog(view.container);
    const input = getInput(dialog);
    await user.type(input, 'ub');
    view.update({
      catalog: initial.catalog.map((item) => item.id === '1UBQ' ? { ...item, name: 'Ubiquitin updated' } : item),
      saved: [{ id: 'local-lab', filename: 'revised.cif', label: 'Revised model', residueCount: 2222 }],
      currentId: 'local-lab',
      panelOpen: true,
    });
    await nextTick();
    expect(within(view.container).getByRole('complementary', { name: 'Library' })).toBe(panel);
    expect(getDialog(view.container)).toBe(dialog);
    expect(getInput(dialog)).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('ub');
    expect(panel).toHaveAttribute('data-open', 'true');
    expect(within(panel).getByText('1 saved')).toBeVisible();
    expect(within(panel).getByRole('button', { name: /Revised model/ })).toHaveAttribute('aria-current', 'true');
    expect(within(panel).getByText(`${(2222).toLocaleString()} observed residues`)).toBeVisible();
    expect(within(panel).getByRole('button', { name: /1CRN.*Crambin/ })).not.toHaveAttribute('aria-current');
    expect(within(panel).queryByRole('img', { name: 'Saved on this device' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /1UBQ.*Ubiquitin updated/ })).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: /1CRN.*Crambin/ })).not.toBeInTheDocument();
    expect(showModal).toHaveBeenCalledOnce();
    expect(initial.saved[1]?.filename).toBe('experiment.cif');
    expect(initial.catalog[1]?.name).toBe('Ubiquitin');
    expect(view.host.reportError).not.toHaveBeenCalled();
  });

  it('supports empty catalogs/libraries and changes which saved items are additional', async () => {
    const view = mountLibrary({ catalog: [], saved: [], searchOpen: true });
    expect(within(view.container).getByText('0 saved')).toBeVisible();
    expect(within(view.container).queryByRole('heading', { name: 'Your structures' })).not.toBeInTheDocument();
    expect(within(getDialog(view.container)).getByText('No matching examples. Enter a PDB identifier to load from RCSB.')).toBeVisible();
    view.update({ saved: initial.saved });
    await nextTick();
    expect(within(view.container).getAllByRole('button', { name: /Remove .* from device library/ })).toHaveLength(2);
    view.update({ catalog: initial.catalog });
    await nextTick();
    expect(within(view.container).getAllByRole('button', { name: /Remove .* from device library/ })).toHaveLength(1);
    expect(within(view.container).getByRole('img', { name: 'Saved on this device' })).toHaveClass('is-saved');
  });

  it.each(['uBq', 'UBIQUITIN', 'molecular tag'])('matches catalog IDs, names, and topics case-insensitively: %s', async (query) => {
    const user = userEvent.setup();
    const view = mountLibrary({ searchOpen: true });
    const dialog = getDialog(view.container);
    await user.type(getInput(dialog), query);
    expect(within(dialog).getByRole('button', { name: /1UBQ.*Ubiquitin/ })).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: /1CRN.*Crambin/ })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(view.host.openPublic).toHaveBeenCalledExactlyOnceWith('1UBQ');
    expect(view.host.closeSearch).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(false);
  });

  it.each([
    [' 4hhb ', '4HHB'],
    ['pdb_00001crn', '1CRN'],
    ['PDB_00001UBQ', '1UBQ'],
    ['PDB_12345678', 'pdb_12345678'],
    ['2xyz', '2XYZ'],
  ])('normalizes valid identifiers through the shared validator: %s', async (query, id) => {
    const user = userEvent.setup();
    const view = mountLibrary({ searchOpen: true });
    const dialog = getDialog(view.container);
    await user.type(getInput(dialog), query);
    await user.click(within(dialog).getByRole('button', { name: 'Open structure' }));
    expect(view.host.openPublic).toHaveBeenCalledExactlyOnceWith(id);
    expect(view.host.closeSearch).toHaveBeenCalledOnce();
    expect(view.host.reportError).not.toHaveBeenCalled();
  });

  it.each(['', 'not-a-structure', 'https://example.com/1CRN'])('keeps invalid identifiers in the dialog with an associated inline error: %s', async (query) => {
    const user = userEvent.setup();
    const view = mountLibrary({ searchOpen: true });
    const dialog = getDialog(view.container);
    const input = getInput(dialog);
    if (query) await user.type(input, query);
    await user.click(within(dialog).getByRole('button', { name: 'Open structure' }));
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a PDB ID such as 1CRN or an extended ID such as pdb_00001crn.');
    expect(within(dialog).getByRole('alert')).toHaveClass('error-text');
    expect(dialog.open).toBe(true);
    expect(view.host.openPublic).not.toHaveBeenCalled();
    expect(view.host.closeSearch).not.toHaveBeenCalled();
    expect(view.host.reportError).not.toHaveBeenCalled();
    await user.type(input, 'x');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears local query/error after choosing a search result but not after cancellation', async () => {
    const user = userEvent.setup();
    const view = mountLibrary({ searchOpen: true });
    const dialog = getDialog(view.container);
    const input = getInput(dialog);
    await user.type(input, 'nonsense{Enter}');
    expect(within(dialog).getByRole('alert')).toBeVisible();
    await user.clear(input);
    await user.type(input, 'ub');
    await user.click(within(dialog).getByRole('button', { name: /1UBQ.*Ubiquitin/ }));
    expect(view.host.openPublic).toHaveBeenCalledExactlyOnceWith('1UBQ');
    expect(view.host.closeSearch).toHaveBeenCalledOnce();
    view.update({ searchOpen: false });
    await nextTick();
    view.update({ searchOpen: true });
    await nextTick();
    expect(getInput(dialog)).toHaveValue('');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    await user.type(input, 'cram');
    await user.click(within(dialog).getByRole('button', { name: 'Close structure search' }));
    view.update({ searchOpen: false });
    await nextTick();
    view.update({ searchOpen: true });
    await nextTick();
    expect(getInput(dialog)).toHaveValue('cram');
  });

  it('opens from a snapshot change, traps keyboard focus among current controls, and restores the trigger on Escape', async () => {
    const user = userEvent.setup();
    const trigger = append(document.createElement('button'));
    trigger.textContent = 'Open search';
    const view = mountLibrary();
    trigger.focus();
    view.update({ searchOpen: true });
    await nextTick();
    const dialog = getDialog(view.container);
    const input = getInput(dialog);
    const close = within(dialog).getByRole('button', { name: 'Close structure search' });
    const lastResult = within(dialog).getByRole('button', { name: /4HHB.*Hemoglobin/ });
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(lastResult).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.type(input, 'no examples');
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Open structure' })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(dialog.open).toBe(false);
    expect(trigger).toHaveFocus();
    expect(view.host.closeSearch).toHaveBeenCalledOnce();
    await user.keyboard('{Escape}');
    expect(view.host.closeSearch).toHaveBeenCalledOnce();
  });

  it('handles native cancellation exactly once despite the following close event', async () => {
    const view = mountLibrary({ searchOpen: true });
    const dialog = getDialog(view.container);
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    await nextTick();
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(view.host.closeSearch).toHaveBeenCalledOnce();
    dialog.dispatchEvent(new Event('close'));
    expect(view.host.closeSearch).toHaveBeenCalledOnce();
  });

  it('does not echo host-driven closure, and ignores a stale native close event after reopening', async () => {
    const trigger = append(document.createElement('button'));
    trigger.focus();
    const view = mountLibrary({ searchOpen: true });
    const dialog = getDialog(view.container);
    view.update({ searchOpen: false });
    await nextTick();
    expect(trigger).toHaveFocus();
    expect(dialog.open).toBe(false);
    expect(view.host.closeSearch).not.toHaveBeenCalled();
    view.update({ searchOpen: true });
    await nextTick();
    dialog.dispatchEvent(new Event('close'));
    expect(dialog.open).toBe(true);
    expect(view.host.closeSearch).not.toHaveBeenCalled();
    dialog.close();
    await waitFor(() => expect(view.host.closeSearch).toHaveBeenCalledOnce());
    expect(trigger).toHaveFocus();
  });

  it('keeps simultaneous mounts, queries, label IDs, focus restoration, and host commands independent', async () => {
    const user = userEvent.setup();
    const first = mountLibrary({ searchOpen: true });
    const firstInput = getInput(getDialog(first.container));
    await user.type(firstInput, 'ub');
    const second = mountLibrary({ searchOpen: true, panelOpen: true });
    const secondDialog = getDialog(second.container);
    const secondInput = getInput(secondDialog);
    await user.type(secondInput, 'cram');
    expect(firstInput).toHaveValue('ub');
    expect(secondInput).toHaveValue('cram');
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    await user.click(within(secondDialog).getByRole('button', { name: 'Close structure search' }));
    expect(firstInput).toHaveFocus();
    expect(second.host.closeSearch).toHaveBeenCalledOnce();
    expect(first.host.closeSearch).not.toHaveBeenCalled();
    second.handle.unmount();
    expect(getDialog(first.container).open).toBe(true);
    expect(firstInput).toHaveValue('ub');
    await user.keyboard('{Enter}');
    expect(first.host.openPublic).toHaveBeenCalledExactlyOnceWith('1UBQ');
    expect(second.host.openPublic).not.toHaveBeenCalled();
  });

  it('idempotently unmounts open dialogs and pending updates without stale commands or removing the host/siblings', async () => {
    const trigger = append(document.createElement('button'));
    trigger.focus();
    const container = append(document.createElement('div'));
    container.id = 'integration-host';
    const sibling = append(document.createElement('p'));
    sibling.textContent = 'Host content';
    const view = mountLibrary({ searchOpen: true }, makeHost(), container);
    const dialog = getDialog(container);
    const input = getInput(dialog);
    const importButton = within(container).getByRole('button', { name: 'Open a local file' });
    view.update({ catalog: [], searchOpen: false });
    view.handle.unmount();
    view.handle.unmount();
    view.update({ searchOpen: true });
    importButton.click();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    dialog.dispatchEvent(new Event('close'));
    await nextTick();
    expect(container).toBeInTheDocument();
    expect(container.id).toBe('integration-host');
    expect(container).toBeEmptyDOMElement();
    expect(sibling).toHaveTextContent('Host content');
    expect(dialog.open).toBe(false);
    expect(trigger).toHaveFocus();
    for (const command of Object.values(view.host)) expect(command).not.toHaveBeenCalled();
  });

  it('reserves independent accessible IDs even when hosts are attached after mounting', async () => {
    const user = userEvent.setup();
    const first = mountLibrary({}, makeHost(), document.createElement('div'));
    const second = mountLibrary({}, makeHost(), document.createElement('div'));
    append(first.container);
    append(second.container);
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    await user.click(within(second.container).getByRole('button', { name: /Lab model/ }));
    expect(second.host.openSaved).toHaveBeenCalledExactlyOnceWith('local-lab');
    expect(first.host.openSaved).not.toHaveBeenCalled();
  });

  it('safely replaces an existing mount on the same container and ignores the old handle', async () => {
    const user = userEvent.setup();
    const first = mountLibrary({ searchOpen: true });
    const staleImport = within(first.container).getByRole('button', { name: 'Open a local file' });
    const oldDialog = getDialog(first.container);
    const second = mountLibrary({}, makeHost(), first.container);
    first.handle.unmount();
    first.update({ searchOpen: true });
    staleImport.click();
    oldDialog.dispatchEvent(new Event('close'));
    await nextTick();
    expect(oldDialog.open).toBe(false);
    expect(within(second.container).getAllByRole('complementary', { name: 'Library' })).toHaveLength(1);
    await user.click(within(second.container).getByRole('button', { name: 'Open a local file' }));
    expect(first.host.requestImport).not.toHaveBeenCalled();
    expect(first.host.closeSearch).not.toHaveBeenCalled();
    expect(second.host.requestImport).toHaveBeenCalledOnce();
    second.handle.unmount();
    const third = mountLibrary({}, makeHost(), first.container);
    expect(within(third.container).getByRole('complementary', { name: 'Library' })).toHaveAttribute('id', 'library-panel');
  });

  it('does not issue a follow-up command when a host callback synchronously disposes the module', async () => {
    const user = userEvent.setup();
    const view = mountLibrary({ searchOpen: true });
    view.host.openPublic.mockImplementation(() => view.handle.unmount());
    await user.click(within(getDialog(view.container)).getByRole('button', { name: /1CRN.*Crambin/ }));
    expect(view.host.openPublic).toHaveBeenCalledExactlyOnceWith('1CRN');
    expect(view.host.closeSearch).not.toHaveBeenCalled();
    expect(view.container).toBeEmptyDOMElement();
  });

  it('reports runtime command failures once and leaves fatal recovery UI to the host', async () => {
    const user = userEvent.setup();
    const view = mountLibrary();
    view.host.requestImport.mockImplementation(() => { throw new Error('Import host failed'); });
    await user.click(within(view.container).getByRole('button', { name: 'Open a local file' }));
    expect(view.host.reportError).toHaveBeenCalledExactlyOnceWith('Import host failed');
    expect(within(view.container).queryByRole('alert')).not.toBeInTheDocument();
    await user.click(within(view.container).getByRole('button', { name: 'Clear saved files' }));
    expect(view.host.clearSaved).not.toHaveBeenCalled();
    expect(view.host.reportError).toHaveBeenCalledOnce();
  });

  it('does not disguise search host failures as invalid user input', async () => {
    const user = userEvent.setup();
    const view = mountLibrary({ searchOpen: true });
    const dialog = getDialog(view.container);
    view.host.openPublic.mockImplementation(() => { throw new Error('Public host failed'); });
    await user.type(getInput(dialog), '1crn{Enter}');
    expect(view.host.reportError).toHaveBeenCalledExactlyOnceWith('Public host failed');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(getInput(dialog)).toHaveAttribute('aria-invalid', 'false');
    expect(view.host.closeSearch).not.toHaveBeenCalled();
  });

  it('routes reactive render errors through the Vue error handler without duplicate alerts', async () => {
    const view = mountLibrary();
    view.update({
      catalog: [{
        id: '1CRN', organism: '', topic: '',
        get name(): string { throw new Error('Catalog render failed'); },
      }],
    });
    await nextTick();
    expect(view.host.reportError).toHaveBeenCalledExactlyOnceWith('Catalog render failed');
    expect(within(view.container).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports native dialog lifecycle failures after initialization', async () => {
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(() => { throw new Error('Dialog unavailable'); });
    const view = mountLibrary();
    view.update({ searchOpen: true });
    await nextTick();
    expect(view.host.reportError).toHaveBeenCalledExactlyOnceWith('Dialog unavailable');
    expect(within(view.container).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cleans up synchronous Vue lifecycle failures before rethrowing to the boundary', async () => {
    const user = userEvent.setup();
    const container = append(document.createElement('div'));
    const host = makeHost();
    const failure = new Error('Initial dialog failed');
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementationOnce(() => { throw failure; });
    expect(() => mountLibrary({ searchOpen: true }, host, container)).toThrow(failure);
    expect(host.reportError).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
    await nextTick();
    expect(container).toBeEmptyDOMElement();
    const replacement = mountLibrary({}, makeHost(), container);
    expect(within(container).getByRole('complementary', { name: 'Library' })).toHaveAttribute('id', 'library-panel');
    await user.click(within(container).getByRole('button', { name: 'Open a local file' }));
    expect(host.requestImport).not.toHaveBeenCalled();
    expect(replacement.host.requestImport).toHaveBeenCalledOnce();
  });

  it('rethrows createApp failures without retaining mount state or reserving IDs', () => {
    const container = append(document.createElement('div'));
    const host = makeHost();
    const failure = new Error('Vue creation failed');
    vi.mocked(createApp).mockImplementationOnce(() => { throw failure; });
    expect(() => mountLibrary({}, host, container)).toThrow(failure);
    expect(container).toBeEmptyDOMElement();
    expect(host.reportError).not.toHaveBeenCalled();
    const replacement = mountLibrary({}, makeHost(), container);
    expect(within(replacement.container).getByRole('complementary', { name: 'Library' })).toHaveAttribute('id', 'library-panel');
  });

  it('unmounts an initialized partial app if its mount throws before returning', async () => {
    const vue = await vi.importActual<typeof import('vue')>('vue');
    const unmounted = vi.fn();
    const trigger = append(document.createElement('button'));
    trigger.focus();
    const container = append(document.createElement('div'));
    const host = makeHost();
    const failure = new Error('Mount did not finish');
    let staleImport: HTMLElement | undefined;
    let partialDialog: HTMLDialogElement | undefined;
    vi.mocked(createApp).mockImplementationOnce((...args) => {
      const app = vue.createApp(...args);
      const mount = app.mount.bind(app);
      const unmount = app.unmount.bind(app);
      app.mount = (...mountArgs) => {
        mount(...mountArgs);
        staleImport = within(container).getByRole('button', { name: 'Open a local file' });
        partialDialog = getDialog(container);
        throw failure;
      };
      app.unmount = () => { unmounted(); unmount(); };
      return app;
    });
    expect(() => mountLibrary({ searchOpen: true }, host, container)).toThrow(failure);
    expect(unmounted).toHaveBeenCalledOnce();
    expect(container).toBeEmptyDOMElement();
    expect(trigger).toHaveFocus();
    expect(partialDialog).not.toHaveAttribute('open');
    staleImport?.click();
    partialDialog?.dispatchEvent(new Event('close'));
    await nextTick();
    for (const command of Object.values(host)) expect(command).not.toHaveBeenCalled();
  });

  it.each([false, true])('reports deferred event failures only while mounted (disposed: %s)', async (dispose) => {
    const user = userEvent.setup();
    const view = mountLibrary();
    let rejectCommand: (cause: Error) => void = () => { throw new Error('Command has not started'); };
    view.host.requestImport.mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectCommand = reject; }));
    await user.click(within(view.container).getByRole('button', { name: 'Open a local file' }));
    if (dispose) view.handle.unmount();
    rejectCommand(new Error('Deferred host failure'));
    await nextTick();
    if (dispose) expect(view.host.reportError).not.toHaveBeenCalled();
    else expect(view.host.reportError).toHaveBeenCalledExactlyOnceWith('Deferred host failure');
  });
});
