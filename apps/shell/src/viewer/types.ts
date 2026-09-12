import type { Ref } from 'react';
import type { Appearance, Protein, SourceFile } from '@biotool/core/domain/types';

export type Representation = 'cartoon' | 'ball-and-stick' | 'molecular-surface' | 'point';
export type ColorMode = 'chain' | 'element' | 'propensity';

export interface ViewerHandle {
  reset: () => void;
  focus: () => void;
  downloadImage: () => Promise<void>;
  rotate: (axis: 'x' | 'y', degrees: number) => void;
  zoom: (factor: number) => void;
}

export interface MoleculeViewerProps {
  source: SourceFile;
  protein: Protein;
  selection: readonly string[];
  hoverKey: string | null;
  chainKey: string | null;
  representation: Representation;
  colorMode: ColorMode;
  appearance: Appearance;
  showLigands: boolean;
  viewerRef: Ref<ViewerHandle>;
  onSelect: (keys: string[]) => void;
  onHover: (key: string | null) => void;
  onReady: () => void;
  onError: (message: string) => void;
}
