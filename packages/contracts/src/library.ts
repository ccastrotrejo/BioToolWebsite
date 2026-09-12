export const LIBRARY_CONTRACT_VERSION = 1;

export interface LibraryCatalogItem {
  readonly id: string;
  readonly name: string;
  readonly organism: string;
  readonly topic: string;
}

export interface LibrarySavedItem {
  readonly id: string;
  readonly filename: string;
  readonly label: string;
  readonly residueCount: number;
}

export interface LibrarySnapshot {
  readonly catalog: readonly LibraryCatalogItem[];
  readonly saved: readonly LibrarySavedItem[];
  readonly currentId: string | null;
  readonly panelOpen: boolean;
  readonly searchOpen: boolean;
}

export interface LibraryHost {
  openPublic(id: string): void;
  openSaved(id: string): void;
  requestImport(): void;
  removeSaved(id: string): void;
  clearSaved(): void;
  closeSearch(): void;
  reportError(message: string): void;
}

export interface LibraryMount {
  update(snapshot: LibrarySnapshot): void;
  unmount(): void;
}

export interface LibraryModule {
  readonly version: typeof LIBRARY_CONTRACT_VERSION;
  mount(container: HTMLElement, snapshot: LibrarySnapshot, host: LibraryHost): LibraryMount;
}
