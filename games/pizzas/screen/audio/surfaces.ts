// Sounds of the surfaces, all from the existing synthesised effects: stepping onto ice is a low whoosh (a slide), onto a belt a soft thud.
import type { GameEvents, SurfaceEvent } from '@pichi/core/events';
import type { Action } from '@pichi/screen-kit/audio/recipes';

export const SURFACE_ACTIONS: { [K in SurfaceEvent]: (p: GameEvents[K]) => Action[] } = {
  'surface:slide': () => [{ kind: 'play', id: 'whoosh', semis: -7 }],
  'surface:belt': () => [{ kind: 'play', id: 'thud', semis: 7 }],
};
