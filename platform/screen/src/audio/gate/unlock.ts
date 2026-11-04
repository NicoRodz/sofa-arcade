// One audio unlock for every game. Browsers keep an AudioContext `suspended` until a user gesture; the TV is usually driven from the phones, so the
// first gesture on the TV may come long before a game (Manchazo) creates its context. The gate listens from boot, remembers that a gesture happened,
// resumes every registered context that is not running on each gesture, and resumes a context that registers late as soon as it exists.
export const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'click'] as const;

export interface AudioGate {
  /** Track a context: it is resumed on this and every later gesture while it is not running. */
  register(ctx: AudioContext): void;
  /** True once any gesture reached the page. */
  gestured(): boolean;
  dispose(): void;
}

export function createAudioGate(target: EventTarget): AudioGate {
  const contexts = new Set<AudioContext>();
  let seen = false;
  const resume = (ctx: AudioContext) => {
    if (ctx.state === 'closed') contexts.delete(ctx);
    else if (ctx.state !== 'running') void Promise.resolve(ctx.resume()).catch(() => {}); // the game never depends on audio
  };
  const onGesture = () => {
    seen = true;
    for (const ctx of contexts) resume(ctx);
  };
  for (const e of GESTURE_EVENTS) target.addEventListener(e, onGesture, { passive: true });
  return {
    register(ctx) {
      contexts.add(ctx);
      if (seen) resume(ctx);
    },
    gestured: () => seen,
    dispose() {
      for (const e of GESTURE_EVENTS) target.removeEventListener(e, onGesture);
      contexts.clear();
    },
  };
}

let shared: AudioGate | undefined;
/** The page's gate, created on first use (never when the module loads). Call it at boot so the first menu gesture is not missed. */
export function audioGate(): AudioGate {
  if (!shared) shared = createAudioGate(window);
  return shared;
}
