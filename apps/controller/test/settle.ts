// Waits by condition for the phone page (instead of fixed sleeps): every wait has a ceiling, so a page that never settles
// shows up as a failed assert in the test, not as a hang.

/** In-page expression: waits for the viewport to match (when given), two frames, and short transitions/animations (<= 400 ms in total; looping ones are ignored). Resolves true when settled, false on the 1.5 s ceiling. */
export const settleJs = (vw?: number, vh?: number): string => `(async () => {
  const t0 = performance.now();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => { requestAnimationFrame(() => r(0)); setTimeout(r, 100); });
  const size = ${vw === undefined ? 'null' : `[${vw}, ${vh}]`};
  while (size && (innerWidth !== size[0] || innerHeight !== size[1]) && performance.now() - t0 < 2000) await sleep(5);
  await frame(); await frame();
  const busy = () => document.getAnimations().filter((a) => a.playState !== 'finished' && a.playState !== 'idle' && a.playState !== 'paused'
    && (a instanceof CSSTransition || a.effect.getComputedTiming().endTime <= 400));
  for (let list = busy(); list.length; list = busy()) {
    const left = 1500 - (performance.now() - t0);
    if (left <= 0) return false;
    await Promise.race([Promise.allSettled(list.map((a) => a.finished)), sleep(left)]); // wake when they end, no frame spinning
    await frame();
  }
  await frame();
  return true;
})()`;

/** Page-side check that the new document (not the one before the navigation) is up and, for a stored name, that the fake socket opened. */
export const pageReadyJs = (needSocket: boolean): string =>
  `!window.__old && document.readyState === 'complete' && typeof window.__push === 'function'${needSocket ? ' && window.__wsOpen()' : ''}`;

/** Polls `check` every `step` ms until it is true or `ms` pass; returns the last answer. Errors from `check` (a page in navigation) count as false. */
export async function waitUntil(check: () => Promise<boolean>, ms: number, step = 20): Promise<boolean> {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try {
      ok = await check();
    } catch {
      /* not ready yet */
    }
    if (ok || Date.now() >= end) return ok;
    await new Promise((r) => setTimeout(r, step));
  }
}
