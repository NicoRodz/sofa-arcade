// The Captain's D-pad (#remote): every button answers the instant the thumb lands (pointerdown, like the pad's buttons) and the four arrows repeat while
// held, so crossing the 21 maps takes a drag of the thumb, not twenty taps. OK, Atrás and ? never repeat (a held OK would pick, start, pick...).
export const REPEAT_FIRST_MS = 380;
export const REPEAT_EVERY_MS = 130;
const ARROWS = new Set(['up', 'down', 'left', 'right']);

export interface RemoteEnv<K extends string> {
  isCaptain(): boolean;
  isNavKey(key: unknown): key is K;
  send(key: K): void;
}

export function bindRemote<K extends string>(buttons: Iterable<HTMLElement>, env: RemoteEnv<K>) {
  for (const b of buttons) {
    let first: ReturnType<typeof setTimeout> | undefined;
    let every: ReturnType<typeof setInterval> | undefined;
    const up = () => {
      b.classList.remove('down');
      clearTimeout(first);
      clearInterval(every);
    };
    const fire = () => {
      const key = b.dataset.nav;
      if (!env.isNavKey(key) || !env.isCaptain()) return up();
      try {
        navigator.vibrate?.(8);
      } catch {
        /* no vibration API (iOS) */
      }
      env.send(key); // no id in it: the relay knows which phone this socket is
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!env.isNavKey(b.dataset.nav) || !env.isCaptain()) return;
      b.classList.add('down');
      fire();
      if (ARROWS.has(b.dataset.nav)) first = setTimeout(() => (every = setInterval(fire, REPEAT_EVERY_MS)), REPEAT_FIRST_MS);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, up);
  }
}
