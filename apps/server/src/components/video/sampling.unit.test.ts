import { describe, it, expect } from 'vitest';
import {
  resolveDurationSeconds,
  uniformTimestamps,
  hybridKeepIndices,
  plannedTimestamps,
  applyHybridKeep
} from './sampling';

describe('resolveDurationSeconds', () => {
  it('defaults to 5 when neither duration nor windowSeconds is provided', () => {
    expect(resolveDurationSeconds({})).toBe(5);
  });

  it('uses duration when only duration is provided', () => {
    expect(resolveDurationSeconds({ duration: 3 })).toBe(3);
    expect(resolveDurationSeconds({ duration: 10 })).toBe(10);
  });

  it('uses windowSeconds when only windowSeconds is provided', () => {
    expect(resolveDurationSeconds({ windowSeconds: 5 })).toBe(5);
    expect(resolveDurationSeconds({ windowSeconds: 12 })).toBe(12);
  });

  it('prefers windowSeconds when both are provided (alias takes precedence)', () => {
    expect(resolveDurationSeconds({ duration: 3, windowSeconds: 5 })).toBe(5);
  });

  it('ignores non-positive values and falls back', () => {
    expect(resolveDurationSeconds({ duration: 0, windowSeconds: 0 })).toBe(5);
    expect(resolveDurationSeconds({ duration: -1 })).toBe(5);
  });
});

describe('uniformTimestamps', () => {
  it('produces 6 frames for duration=3 + fps=2 (back-compat shape)', () => {
    expect(uniformTimestamps(3, 2)).toEqual([0.0, 0.5, 1.0, 1.5, 2.0, 2.5]);
  });

  it('produces 10 frames for duration=5 + fps=2 (pre-drop)', () => {
    expect(uniformTimestamps(5, 2)).toEqual([0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5]);
  });

  it('produces 5 frames for duration=5 + fps=1', () => {
    expect(uniformTimestamps(5, 1)).toEqual([0, 1, 2, 3, 4]);
  });

  it('returns empty for non-positive inputs', () => {
    expect(uniformTimestamps(0, 2)).toEqual([]);
    expect(uniformTimestamps(5, 0)).toEqual([]);
  });
});

describe('hybridKeepIndices', () => {
  it('returns null for non-hybrid presets (back-compat)', () => {
    expect(hybridKeepIndices(3, 2)).toBeNull();
    expect(hybridKeepIndices(5, 1)).toBeNull();
    expect(hybridKeepIndices(10, 2)).toBeNull();
  });

  it('returns 8 keep-indices for the hybrid duration=5 + fps=2 preset', () => {
    // uniform: [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5]
    // keep:    [ ✓ ,  ✓ ,  ✓ ,  ✓ ,  ✓ ,  ✓ ,  ✓ ,  -,   ✓ ,  - ]
    expect(hybridKeepIndices(5, 2)).toEqual([0, 1, 2, 3, 4, 5, 6, 8]);
  });
});

describe('plannedTimestamps', () => {
  it('returns the canonical hybrid timestamps for duration=5 + fps=2', () => {
    expect(plannedTimestamps(5, 2)).toEqual([0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]);
  });

  it('returns the uniform timestamps for duration=3 + fps=2 (back-compat)', () => {
    expect(plannedTimestamps(3, 2)).toEqual([0.0, 0.5, 1.0, 1.5, 2.0, 2.5]);
  });

  it('returns the uniform timestamps for any non-hybrid preset', () => {
    expect(plannedTimestamps(5, 1)).toEqual([0, 1, 2, 3, 4]);
    expect(plannedTimestamps(2, 4)).toEqual([0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75]);
  });
});

describe('applyHybridKeep', () => {
  it('drops the right indices on the hybrid preset', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    expect(applyHybridKeep(items, 5, 2)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'i']);
  });

  it('returns the items untouched on non-hybrid presets (back-compat)', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(applyHybridKeep(items, 3, 2)).toBe(items);
  });

  it('does not throw when ffmpeg returned fewer frames than expected', () => {
    // Source video shorter than 5s → only first 7 frames produced.
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    // Hybrid wants indices [0..6, 8]; index 8 is out of range → silently dropped.
    expect(applyHybridKeep(items, 5, 2)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });
});
