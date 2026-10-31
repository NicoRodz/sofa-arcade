// Keys for the two versus screens that only answered to the mouse: the pause bar ("Seguir sin ganador" / "Terminar") and the results buttons
// ("Revancha" / "Cambiar equipos" / "Volver al lobby"). The Mac keyboard and the Captain's D-pad arrive here as the same key (platform/screen keys.ts).
// Left/Right (and Up/Down) move the highlighted button, Enter presses it, Esc in the results is "Volver al lobby". The first button is
// highlighted when the screen appears: Enter on the results is still Revancha, and on the pause it is Seguir sin ganador.
import { app } from '@pichi/screen-kit/shell/app-state';
import { $ } from '@pichi/screen-kit/ui/dom';
import { VERSUS_NAV, versusNavStep, type VersusNavCtx as Ctx } from '@pichi/game-pizzas/screen/versus-nav';
import { PIZZAS, pz } from './state';
let sel = 0;

/** Which of the two screens is up (null: neither, or not the Pizzas versus). */
export function versusCtx(): Ctx | null {
  if (app.activeGame !== PIZZAS || !pz.game.versus) return null;
  if (app.phase === 'playing' && pz.game.paused) return 'pause';
  return app.phase === 'results' && !app.starting ? 'results' : null;
}

/** Puts the highlight on the first button of `ctx` (the pause bar and the results call it when they appear). */
export function resetFocus(ctx: Ctx) {
  sel = 0;
  paint(ctx);
}
function paint(ctx: Ctx) {
  VERSUS_NAV[ctx].buttons.forEach((id, i) => $(id).classList.toggle('sel', i === sel));
}

/** True when the key was for the versus pause / results (the screen's key hook then stops there). */
export function versusKey(key: string, repeat: boolean): boolean {
  const ctx = versusCtx();
  if (!ctx) return false;
  const step = versusNavStep(ctx, sel, key, repeat);
  if (!step.handled) return false;
  sel = step.sel;
  paint(ctx);
  if (step.press) $(step.press).click();
  return true;
}
