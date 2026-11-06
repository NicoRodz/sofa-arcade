// Everything that makes the Phaser screen render the same pixels on every run. Injected before any page script (Page.addScriptToEvaluateOnNewDocument).
//  - requestAnimationFrame is a queue the test drains with window.__frames(n): one call = n frames of exactly 1000/60 ms, so the sim, the tweens and the particles advance only when asked.
//  - performance.now, Date.now and `new Date()` read that same fake clock (starts at 1000 ms, never moves by itself).
//  - setTimeout can be moved onto that clock (window.__fakeTimers(true)) for the sequences made of timeouts.
//  - Math.random is mulberry32 with a fixed seed (Phaser particles, shakes and ambient effects draw from it).
// CSS animations and transitions run on the compositor, outside the fake clock: `settleAnimations` freezes them at their end state (finite) or at 0 (infinite loops) before each shot.
export const PAGE_FAKES = `(() => {
  let seed = 12345;
  Math.random = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  window.__reseed = (n) => { seed = n; };
  const EPOCH = 1700000000000;
  let now = 1000;
  performance.now = () => now;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(EPOCH + now); }
    static now() { return EPOCH + now; }
  }
  window.Date = FakeDate;
  let q = []; let id = 0;
  window.requestAnimationFrame = (cb) => { q.push([++id, cb]); return id; };
  window.cancelAnimationFrame = (i) => { q = q.filter((x) => x[0] !== i); };
  // same callbacks, same timestamp: the page keeps running (loaders, scene boot) while game time stands still
  window.__idle = () => { const cur = q; q = []; for (const [, cb] of cur) cb(now); };
  // setTimeout on the fake clock, once window.__fakeTimers(true) is called (the results reveal is a chain of timeouts: real ones would fire at a different frame every run).
  // Off by default: the page's own plumbing (reconnects, polling) keeps using real timers.
  const realSetTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  let fake = false; let tid = 0; let timers = [];
  window.__fakeTimers = (on) => { fake = on; };
  window.setTimeout = (fn, ms = 0, ...args) => {
    if (!fake || typeof fn !== 'function') return realSetTimeout(fn, ms, ...args);
    const id = -(++tid);
    timers.push({ id, at: now + Math.max(0, Number(ms) || 0), seq: tid, fn: () => fn(...args) });
    return id;
  };
  window.clearTimeout = (id) => { if (id < 0) timers = timers.filter((t) => t.id !== id); else realClearTimeout(id); };
  const runTimers = () => {
    for (;;) {
      const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) return;
      timers = timers.filter((t) => t !== due);
      due.fn();
    }
  };
  window.__frames = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 60; runTimers(); const cur = q; q = []; for (const [, cb] of cur) cb(now); } };
})();`;

/** Evaluated in the page before a shot: waits for fonts and pins every CSS animation / transition. Returns how many animations it pinned. */
export const SETTLE_JS = `(async () => {
  await document.fonts.ready;
  const all = document.getAnimations();
  for (const a of all) {
    a.pause();
    const t = a.effect && a.effect.getComputedTiming();
    if (t && Number.isFinite(t.endTime)) a.currentTime = t.endTime;
    else a.currentTime = 0;
  }
  return all.length;
})()`;
