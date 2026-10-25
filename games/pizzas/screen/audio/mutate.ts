// Sounds of the mutating kitchen, all from the existing synthesised effects: the warning is the siren, the change a low rumble (two deep thuds and a slide).
import type { GameEvents, MutateEvent } from '@pichi/core/events';
import type { Action } from '@pichi/screen-kit/audio/recipes';

export const MUTATE_ACTIONS: { [K in MutateEvent]: (p: GameEvents[K]) => Action[] } = {
  'mutate:warn': () => [{ kind: 'play', id: 'siren' }],
  'mutate:apply': () => [
    { kind: 'play', id: 'thud', semis: -12 },
    { kind: 'play', id: 'whoosh', semis: -12 },
    { kind: 'play', id: 'thud', semis: -9 },
  ],
};
