/** Scale camera distance: factors below one zoom in; factors above one zoom out. */
export function scaleCameraDistance(distance: number, factor: number): number {
  return Math.max(1, Math.min(100_000, distance * factor));
}
