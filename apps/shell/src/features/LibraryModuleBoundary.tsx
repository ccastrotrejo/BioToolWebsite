import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { LIBRARY_CONTRACT_VERSION, type LibraryHost, type LibraryMount, type LibrarySnapshot } from '@biotool/contracts';
import { errorMessage } from '../data/source';

interface LibraryModuleBoundaryProps {
  snapshot: LibrarySnapshot;
  host: LibraryHost;
  recovery: (message: string, retry: () => void) => ReactNode;
}

/** Owns the Vue mount point, not the DOM rendered inside it. */
export function LibraryModuleBoundary({ snapshot, host, recovery }: LibraryModuleBoundaryProps) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef({ snapshot, host });
  const connection = useRef<LibraryMount | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<{ loading: boolean; error: string | null }>({ loading: true, error: null });

  useLayoutEffect(() => { latest.current = { snapshot, host }; });
  useEffect(() => {
    const target = container.current!;
    let active = true;
    let mounted: LibraryMount | null = null;
    function dispose() {
      active = false;
      connection.current = null;
      const previous = mounted;
      mounted = null;
      try { previous?.unmount(); }
      finally { target.replaceChildren(); }
    }
    function fail(cause: unknown) {
      if (!active) return;
      let message = errorMessage(cause);
      try { dispose(); }
      catch (cleanupError) { message += ` Cleanup failed: ${errorMessage(cleanupError)}`; }
      setStatus({ loading: false, error: message });
    }
    function dispatch(command: (current: LibraryHost) => void) {
      if (!active) return;
      try { command(latest.current.host); }
      catch (cause) { fail(cause); }
    }
    const commands: LibraryHost = {
      openPublic: (id) => dispatch((current) => current.openPublic(id)),
      openSaved: (id) => dispatch((current) => current.openSaved(id)),
      requestImport: () => dispatch((current) => current.requestImport()),
      removeSaved: (id) => dispatch((current) => current.removeSaved(id)),
      clearSaved: () => dispatch((current) => current.clearSaved()),
      closeSearch: () => dispatch((current) => current.closeSearch()),
      // Vue may report during a render; release its tree after that stack unwinds.
      reportError: (message) => queueMicrotask(() => fail(new Error(message))),
    };
    setStatus({ loading: true, error: null });
    void import('@biotool/structure-library').then(({ structureLibrary }) => {
      if (!active) return;
      if (structureLibrary.version !== LIBRARY_CONTRACT_VERSION) {
        throw new Error('The structure library is incompatible with this app version.');
      }
      mounted = structureLibrary.mount(target, latest.current.snapshot, commands);
      if (!active) { dispose(); return; }
      connection.current = {
        update(next) { if (active) { try { mounted?.update(next); } catch (cause) { fail(cause); } } },
        unmount: dispose,
      };
      setStatus({ loading: false, error: null });
    }).catch(fail);
    return () => {
      try { dispose(); }
      catch (cause) { latest.current.host.reportError(`Library cleanup failed: ${errorMessage(cause)}`); }
    };
  }, [attempt]);
  useEffect(() => { connection.current?.update(snapshot); }, [snapshot]);

  return <div className="library-module-shell">
    <div className="library-module-mount" ref={container} />
    {status.loading && <aside className="library-panel" data-open={snapshot.panelOpen}
      aria-label="Library" aria-busy="true">
      <div className="library-heading"><h2>Library</h2></div>
      <p className="library-intro" role="status">Loading structure library...</p>
    </aside>}
    {status.error && recovery(status.error, () => setAttempt((value) => value + 1))}
  </div>;
}
