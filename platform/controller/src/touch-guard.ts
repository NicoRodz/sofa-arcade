// Touch hardening of the phone page, installed once at load: no zoom (pinch, double-tap), page scroll, selection or context menu, and the visualViewport
// watch that undoes a zoom iOS applied anyway. Moved out of apps/controller/src/main.ts unchanged (the scroll exception for `data-scroll` is new).
import { createZoomGuard, isDoubleTap } from './zoom';

// Touch hardening: no zoom (pinch, double-tap), scroll, selection or context menu. iOS Safari ignores user-scalable=no,
// so the gesture events are cancelled too, and zoom.ts watches visualViewport in case it zooms anyway.
// The one exception is a scrolling list (`data-scroll`, the Captain's menu): its own touchmove has to reach the browser or it could not scroll.
const stop = (e: Event) => {
  if (!(e.target as HTMLElement | null)?.closest?.('[data-scroll]')) e.preventDefault();
};
document.addEventListener('touchmove', stop, { passive: false });
document.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
); // second finger = pinch
for (const g of ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick', 'selectstart']) {
  document.addEventListener(g, (e) => {
    if (!(e.target as HTMLElement | null)?.closest?.('input')) e.preventDefault();
  });
}
let lastEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (isDoubleTap(lastEnd, now)) e.preventDefault();
    lastEnd = now;
  },
  { passive: false },
);

function resetZoom() {
  window.scrollTo(0, 0);
  const meta = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
  if (!meta) return;
  const original = meta.content;
  meta.content = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'; // a changed value makes iOS re-evaluate the scale
  setTimeout(() => {
    meta.content = original;
  }, 120);
}
const zoomGuard = createZoomGuard({
  viewport: window.visualViewport,
  reset: resetZoom,
  onZoomed: (z) => document.body.classList.toggle('zoomed', z),
  later: (fn, ms) => {
    setTimeout(fn, ms);
  },
});
window.visualViewport?.addEventListener('resize', zoomGuard.check);
window.visualViewport?.addEventListener('scroll', zoomGuard.check);
setInterval(zoomGuard.check, 2000);
document.getElementById('zoomfix')?.addEventListener('click', () => zoomGuard.manualReset());
