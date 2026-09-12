import { useCallback, useEffect, useRef, useState } from 'react';
import type { Protein, SourceFile } from '../domain/types';
import { getSaved, listSaved, saveStructure, type SavedStructure } from '../data/library';
import { errorMessage, fetchStructure, importStructure, normalizeAccession } from '../data/source';
import { parseInWorker } from '../workers/client';

export interface Workspace {
  source: SourceFile;
  protein: Protein;
}

export function useWorkbench() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [saved, setSaved] = useState<SavedStructure[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Opening the crambin example');
  const [error, setError] = useState<string | null>(null);
  const [retryId, setRetryId] = useState<string | null>(null);
  const current = useRef<AbortController | null>(null);

  const refreshLibrary = useCallback(async () => {
    try { setSaved(await listSaved()); }
    catch (cause) { setError(errorMessage(cause)); }
  }, []);

  const run = useCallback(async (getSource: (signal: AbortSignal) => Promise<SourceFile>) => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    setError(null);
    setRetryId(null);
    setStatus('Opening structure');
    try {
      const source = await getSource(controller.signal);
      controller.signal.throwIfAborted();
      setStatus('Reading observed residues');
      const protein = await parseInWorker(source, controller.signal);
      controller.signal.throwIfAborted();
      setWorkspace({ source, protein });
      setStatus('Structure ready');
      try {
        await saveStructure({ source, title: protein.title, residueCount: protein.residues.length });
        if (controller.signal.aborted) return;
        const records = await listSaved();
        if (!controller.signal.aborted) setSaved(records);
      } catch (cause) {
        if (!controller.signal.aborted) setError(`Structure loaded, but not saved: ${errorMessage(cause)}`);
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(errorMessage(cause));
        setStatus('Could not open structure. Your previous view is unchanged.');
      }
    } finally {
      if (current.current === controller && !controller.signal.aborted) setBusy(false);
    }
  }, []);

  const loadPublic = useCallback((value: string, refresh = false) => run(async (signal) => {
    const id = normalizeAccession(value);
    setRetryId(id);
    if (!refresh) {
      const cached = await getSaved(id);
      signal.throwIfAborted();
      if (cached) {
        setStatus('Reading saved structure');
        return cached.source;
      }
    }
    setStatus(id === '1CRN' && !refresh ? 'Opening bundled crambin' : `Downloading ${id} from RCSB`);
    return fetchStructure(id, signal, id === '1CRN' && !refresh);
  }), [run]);

  const loadSaved = useCallback((source: SourceFile) => run(async () => source), [run]);
  const loadFile = useCallback((file: File) => run(async () => importStructure(file)), [run]);
  const cancel = useCallback(() => {
    current.current?.abort();
    setBusy(false);
    setStatus('Load canceled. Your previous view is unchanged.');
  }, []);

  useEffect(() => {
    void refreshLibrary();
    const id = new URLSearchParams(window.location.search).get('pdb') ?? '1CRN';
    void loadPublic(id);
    return () => current.current?.abort();
  }, [loadPublic, refreshLibrary]);

  return { workspace, saved, busy, status, error, retryId, setError, loadPublic, loadSaved, loadFile, cancel, refreshLibrary };
}
