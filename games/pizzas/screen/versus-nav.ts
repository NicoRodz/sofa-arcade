// What a key does on the two versus screens that only answered to the mouse: the pause bar and the results buttons. Pure (the DOM glue is
// apps/screen/src/pizzas/key-nav.ts). Left/Up and Right/Down move the highlight, Enter or Space presses it, Esc goes back where it makes sense.
export type VersusNavCtx = 'pause' | 'results';
// The first button is what Enter always did (Seguir sin ganador; Revancha). `back`: the button Esc presses (the pause has none: Terminar is not a retreat).
export const VERSUS_NAV: Record<VersusNavCtx, { buttons: readonly string[]; back: string | null }> = {
  pause: { buttons: ['pcont', 'pend'], back: null },
  results: { buttons: ['vs-rematch', 'vs-shuffle', 'vs-lobby'], back: 'vs-lobby' },
};

export interface VersusNavStep {
  handled: boolean; // the key was for this screen
  sel: number; // the highlighted button afterwards
  press: string | null; // the element id to click
}

export function versusNavStep(ctx: VersusNavCtx, sel: number, key: string, repeat: boolean): VersusNavStep {
  const { buttons, back } = VERSUS_NAV[ctx];
  const n = buttons.length;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return { handled: true, sel: (sel + n - 1) % n, press: null };
  if (key === 'ArrowRight' || key === 'ArrowDown') return { handled: true, sel: (sel + 1) % n, press: null };
  if (key === 'Enter' || key === ' ') return { handled: true, sel, press: repeat ? null : (buttons[sel] ?? null) };
  if (key === 'Escape' && back) return { handled: true, sel, press: repeat ? null : back };
  return { handled: false, sel, press: null };
}
