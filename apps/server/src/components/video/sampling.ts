/**
 * Frame-sampling helpers for the /video/process endpoint.
 *
 * The endpoint extracts a base64 audio clip + a small set of base64 video frames
 * from the first N seconds of an uploaded video. For Hookvio's "first N seconds"
 * analysis we want a denser sample at the very start of the clip and a sparser
 * sample further in.
 *
 * To avoid invoking ffmpeg with brittle variable-fps filter expressions, we
 * always run ffmpeg at a **uniform fps** over the whole window and then drop
 * frames after the fact in JS. This keeps the worker untouched and the math
 * deterministic.
 *
 * Today's only "hybrid" preset is duration=5 + fps=2:
 *   - ffmpeg produces 10 frames at t = 0.0, 0.5, ... 4.5 (one every 0.5s)
 *   - we keep all 6 frames in [0, 3) and only every other frame in [3, 5]
 *     → final 8 frames: [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]
 *
 * For any other duration we keep the uniform sampling untouched (back-compat).
 */

export interface ResolveDurationInput {
  duration?: number;
  windowSeconds?: number;
}

/**
 * The endpoint accepts either `duration` (legacy) or `windowSeconds` (the
 * new alias used by the upcoming paid-tier window-size spinner). When neither
 * is supplied we default to 5s. `windowSeconds` wins when both are provided.
 */
export function resolveDurationSeconds({ duration, windowSeconds }: ResolveDurationInput): number {
  if (typeof windowSeconds === 'number' && windowSeconds > 0) {
    return windowSeconds;
  }
  if (typeof duration === 'number' && duration > 0) {
    return duration;
  }
  return 5;
}

/**
 * Generate the uniform list of timestamps ffmpeg would produce for a given
 * (fps, duration) pair. ffmpeg's `fps=N` filter places frames at t = i/N
 * starting from 0 and stops before t reaches the duration cutoff.
 */
export function uniformTimestamps(durationSeconds: number, fps: number): number[] {
  if (durationSeconds <= 0 || fps <= 0) return [];
  const step = 1 / fps;
  const out: number[] = [];
  // Use an integer counter to dodge floating-point drift when stepping by 0.5
  for (let i = 0; ; i += 1) {
    const t = i * step;
    if (t >= durationSeconds) break;
    out.push(roundTime(t));
  }
  return out;
}

/**
 * Indices to keep when applying the hybrid sampling rule for the
 * duration=5 + fps=2 preset:
 *   - keep every uniform frame in [0, 3)s
 *   - keep every OTHER uniform frame in [3, 5]s (i.e. drop t=3.5 and t=4.5)
 *
 * Returns the sorted list of indices into the uniform sample. For any
 * non-hybrid (duration, fps) combination this returns null, signaling
 * "no drop, use uniform sampling as-is".
 */
export function hybridKeepIndices(durationSeconds: number, fps: number): number[] | null {
  if (durationSeconds !== 5 || fps !== 2) return null;
  const uniform = uniformTimestamps(durationSeconds, fps);
  const keep: number[] = [];
  for (let i = 0; i < uniform.length; i += 1) {
    const t = uniform[i] as number;
    if (t < 3) {
      keep.push(i);
    } else {
      // In the [3, 5] tail: keep frames whose offset-from-3 is an even
      // multiple of the step (1/fps). With fps=2 that's t=3.0 and t=4.0.
      const offsetSteps = Math.round((t - 3) * fps);
      if (offsetSteps % 2 === 0) keep.push(i);
    }
  }
  return keep;
}

/**
 * Compute the final list of timestamps the endpoint will return for a given
 * (duration, fps) pair, applying hybrid sampling when applicable.
 */
export function plannedTimestamps(durationSeconds: number, fps: number): number[] {
  const uniform = uniformTimestamps(durationSeconds, fps);
  const keep = hybridKeepIndices(durationSeconds, fps);
  if (!keep) return uniform;
  return keep.map((i) => uniform[i] as number);
}

/**
 * Apply the hybrid keep-indices to the actual list of frame buffers ffmpeg
 * produced (sorted lexicographically as `frame_0001.jpg`, `frame_0002.jpg`,
 * ...). If hybrid sampling does not apply, returns the input unchanged.
 *
 * If ffmpeg returned fewer frames than expected (e.g. the source video was
 * shorter than `durationSeconds`) we keep whatever indices are still in range
 * — we never index past the end of the array.
 */
export function applyHybridKeep<T>(items: T[], durationSeconds: number, fps: number): T[] {
  const keep = hybridKeepIndices(durationSeconds, fps);
  if (!keep) return items;
  return keep.filter((i) => i < items.length).map((i) => items[i] as T);
}

/**
 * Round to 6 decimals to mop up floating-point noise from `i * step` while
 * preserving fractional fps (e.g. fps=4 → step=0.25 → t=0.25, 0.5, 0.75, ...).
 */
function roundTime(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
