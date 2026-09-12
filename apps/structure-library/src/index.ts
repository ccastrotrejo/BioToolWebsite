import { createApp, h, shallowRef, type App } from 'vue';
import { LIBRARY_CONTRACT_VERSION, type LibraryHost, type LibraryModule, type LibraryMount } from '@biotool/contracts';
import StructureLibrary from './StructureLibrary.vue';

const mounts = new WeakMap<HTMLElement, LibraryMount>();
const activePrefixes = new Set<string>();
let instanceId = 0;

/** Mounts the metadata-only Vue library into a host-owned container. */
export const structureLibrary = {
  version: LIBRARY_CONTRACT_VERSION,
  mount(container, snapshot, host) {
    mounts.get(container)?.unmount();

    const current = shallowRef(snapshot);
    let app: App<Element> | undefined;
    let disposed = false;
    let failed = false;
    let mounting = true;
    let mountFailure: { cause: unknown } | undefined;
    let idPrefix = 'library';
    while (activePrefixes.has(idPrefix) || container.ownerDocument.getElementById(`${idPrefix}-panel`)) {
      idPrefix = `library-${++instanceId}`;
    }

    function reportError(cause: unknown) {
      if (disposed || failed) return;
      failed = true;
      if (mounting) {
        // Let Vue finish installing the tree so its normal unmount can dispose every scope.
        mountFailure = { cause };
        return;
      }
      host.reportError(cause instanceof Error ? cause.message : String(cause));
    }

    const commands: LibraryHost = {
      openPublic(id) { if (!disposed && !failed) return host.openPublic(id); },
      openSaved(id) { if (!disposed && !failed) return host.openSaved(id); },
      requestImport() { if (!disposed && !failed) return host.requestImport(); },
      removeSaved(id) { if (!disposed && !failed) return host.removeSaved(id); },
      clearSaved() { if (!disposed && !failed) return host.clearSaved(); },
      closeSearch() { if (!disposed && !failed) return host.closeSearch(); },
      reportError,
    };
    const handle: LibraryMount = {
      update(next) {
        if (!disposed && !failed) current.value = next;
      },
      unmount() {
        if (disposed) return;
        disposed = true;
        try {
          app?.unmount();
        } finally {
          mounts.delete(container);
          activePrefixes.delete(idPrefix);
        }
      },
    };

    try {
      app = createApp({
        setup: () => () => h(StructureLibrary, { snapshot: current.value, host: commands, idPrefix }),
      });
      app.config.errorHandler = reportError;
      activePrefixes.add(idPrefix);
      app.mount(container);
      if (mountFailure) throw mountFailure.cause;
      mounts.set(container, handle);
      mounting = false;
    } catch (cause) {
      try {
        handle.unmount();
      } finally {
        container.replaceChildren();
      }
      throw cause;
    }
    return handle;
  },
} satisfies LibraryModule;
