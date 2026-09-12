import { describe, expect, it } from 'vitest';
import { scaleCameraDistance } from './camera';

describe('accessible camera zoom', () => {
  it('matches the toolbar distance-scaling convention', () => {
    expect(scaleCameraDistance(100, 0.8)).toBe(80);
    expect(scaleCameraDistance(100, 1.25)).toBe(125);
    expect(scaleCameraDistance(scaleCameraDistance(100, 0.8), 1.25)).toBe(100);
  });

  it('bounds camera distance away from zero and extreme zoom out', () => {
    expect(scaleCameraDistance(1, 0.8)).toBe(1);
    expect(scaleCameraDistance(100_000, 1.25)).toBe(100_000);
  });
});
