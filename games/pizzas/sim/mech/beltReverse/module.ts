// Reversible belts (design section 3): every 1800 ticks every floor belt turns round (both the push on a chef and the ride of a loose item, since they read the tile). Implemented by T1b.
// The warning is 180 ticks before the flip (state.belt.next <= 180: the art flashes the arrows and the phone of whoever stands on a belt turns violet).
// The belt flip is done on the grid tiles themselves (each game parses its own tiles), so surfaces/ needs no change; a round with the flag on but no `surfaces` gets the surface state here.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { beltReverseValidate } from '../../validate/mech/beltReverse';
import { beltReverseStamp } from '../../gen/stamps/beltReverse';
import { newSurfaceState } from '../../surfaces/config';
import type { Game } from '../../round/state';

export const BELT_PERIOD = 1800;
export const BELT_WARN = 180;

function flip(g: Game) {
  for (const row of g.grid)
    for (const t of row)
      if (t.kind === 'floor' && t.surface?.kind === 'belt') t.surface = { kind: 'belt', dx: -t.surface.dx, dy: -t.surface.dy };
}

export const beltReverseModule: MechModule = {
  ...noopHooks,
  id: 'beltReverse',
  tanda: 'T1b',
  validate: beltReverseValidate,
  stamp: beltReverseStamp,
  init(g) {
    g.mech!.belt = { reversed: false, next: BELT_PERIOD };
    g.surf ??= newSurfaceState();
  },
  beforeMove(g) {
    const b = g.mech!.belt!;
    if (--b.next > 0) return;
    flip(g);
    b.reversed = !b.reversed;
    b.next = BELT_PERIOD;
  },
  hashExtra: (g) => [g.mech!.belt!.reversed ? 1 : 0, g.mech!.belt!.next],
};
