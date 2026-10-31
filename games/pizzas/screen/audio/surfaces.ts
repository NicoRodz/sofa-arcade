// Sounds of the surfaces, all from the existing synthesised effects: stepping onto ice is a low whoosh (a slide), onto a belt a soft thud.
import type { GameEvents, SurfaceEvent } from '../../sim/round/events';
import type { Action } from '@pichi/screen-kit/audio/recipes';

export const SURFACE_ACTIONS: { [K in SurfaceEvent]: (p: GameEvents[K]) => Action[] } = {
  'surface:slide': () => [
    { kind: 'play', id: 'whoosh', semis: -7 },
    { kind: 'play', id: 'hiss', semis: 7 }, // the blade on the ice
  ],
  'surface:belt': () => [{ kind: 'play', id: 'thud', semis: 7 }],
};

/** After a rat dodges (rat:dodge) it pants: a hiss of breath at these moments (ms after the jump), ending when the 0.6 s window does. */
export const PANT_AT_MS = [250, 430, 610] as const;
