// Optional frame-rate probe (`?fps=1`): raw requestAnimationFrame intervals (not Phaser's smoothed delta), summarised as the p95 of the frame time.
// "p95 fps" = 1000 / the frame time that 95 % of the frames beat: 58 means 95 % of the frames came at 58 fps or faster. The numbers are on
// `window.__fps` (stats(), reset()) and in a small readout at the top right of the page. Off by default: nothing runs without the flag.

export interface FpsStats {
  frames: number;
  avg: number; // fps over the window
  p95: number; // fps of the 95th-percentile frame time (see above)
  p99: number;
  worstMs: number; // the longest frame
  slow: number; // frames that took longer than 1000/58 ms
}

export const fpsEnabled = (search: string = typeof location === 'undefined' ? '' : location.search): boolean =>
  new URLSearchParams(search).get('fps') === '1';

export const SLOW_MS = 1000 / 58;

const pct = (sorted: readonly number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!;

/** Pure: frame times in ms -> stats. No frames: all zeros. */
export function summarize(frameMs: readonly number[]): FpsStats {
  if (!frameMs.length) return { frames: 0, avg: 0, p95: 0, p99: 0, worstMs: 0, slow: 0 };
  const sorted = [...frameMs].sort((a, b) => a - b);
  const total = frameMs.reduce((a, b) => a + b, 0);
  return {
    frames: frameMs.length,
    avg: (1000 * frameMs.length) / total,
    p95: 1000 / pct(sorted, 0.95),
    p99: 1000 / pct(sorted, 0.99),
    worstMs: sorted.at(-1)!,
    slow: frameMs.filter((ms) => ms > SLOW_MS).length,
  };
}

const KEEP = 20_000; // frames kept (5 min at 60 fps)

export interface FpsProbe {
  stats(): FpsStats; // page frames (requestAnimationFrame): on a 120 Hz display this reads ~120 even though the game draws at its 60 target
  game(): FpsStats; // frames the game actually rendered (fed by `mark()` from Phaser's STEP, with its rAF timestamp)
  mark(now: number): void;
  reset(): void;
}

/** Starts the probe on this page; `label` is shown beside the numbers (the render scale). */
export function startFpsProbe(label: () => string): FpsProbe {
  const times: number[] = [];
  const drawn: number[] = [];
  let last = 0;
  let lastDrawn = 0;
  const tick = (now: number) => {
    if (last) {
      times.push(now - last);
      if (times.length > KEEP) times.shift();
    }
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const probe: FpsProbe = {
    stats: () => summarize(times),
    game: () => summarize(drawn),
    mark: (now) => {
      if (lastDrawn) {
        drawn.push(now - lastDrawn);
        if (drawn.length > KEEP) drawn.shift();
      }
      lastDrawn = now;
    },
    reset: () => {
      times.length = 0;
      drawn.length = 0;
    },
  };
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;top:6px;right:6px;z-index:99;font:14px monospace;color:#0f0;background:#000a;padding:2px 6px;pointer-events:none';
  document.body.append(box);
  setInterval(() => {
    const s = probe.game();
    box.textContent = `${label()} p95 ${s.p95.toFixed(1)} avg ${s.avg.toFixed(1)} fps (${s.frames})`;
  }, 500);
  (window as unknown as { __fps: FpsProbe }).__fps = probe;
  return probe;
}
