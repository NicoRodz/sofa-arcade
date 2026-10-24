// Zoom defenses for the phone page. iOS Safari ignores user-scalable=no, so the page also blocks the gestures that zoom
// and checks visualViewport.scale: if it ever ends up zoomed it tries to reset itself and, failing that, shows a banner.
export const DOUBLE_TAP_MS = 300;
export const ZOOM_EPSILON = 1.01; // visualViewport.scale above this counts as zoomed

// A touchend this soon after the previous one would form a double-tap: iOS would zoom, so it gets prevented.
export const isDoubleTap = (lastEnd: number, now: number) => now - lastEnd < DOUBLE_TAP_MS;
export const isZoomed = (scale: number | undefined | null) => typeof scale === 'number' && scale > ZOOM_EPSILON;

export interface ZoomGuardOpts {
  viewport?: { scale: number } | null; // window.visualViewport
  reset: () => void; // best-effort: put the page back at scale 1
  onZoomed: (zoomed: boolean) => void; // only on change; true = still zoomed after the automatic attempts
  later: (fn: () => void, ms: number) => void; // setTimeout (injected for tests)
  attempts?: number;
  retryMs?: number;
}

export function createZoomGuard(o: ZoomGuardOpts) {
  const attempts = o.attempts ?? 3, retryMs = o.retryMs ?? 250;
  let tries = 0, shown = false;
  const set = (z: boolean) => { if (z !== shown) { shown = z; o.onZoomed(z); } };
  const check = (): void => {
    if (!isZoomed(o.viewport?.scale)) { tries = 0; set(false); return; }
    if (tries >= attempts) { set(true); return; }
    tries++;
    o.reset();
    o.later(check, retryMs); // the scale updates asynchronously after a reset: look again
  };
  return { check, manualReset() { tries = 0; check(); } };
}
