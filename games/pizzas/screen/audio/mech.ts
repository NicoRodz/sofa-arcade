// Sounds of the map mechanics, all from the existing synthesised effects: a flame on the oil, wiping it, the sprinkler, a bridge that gives way, the mate who is called.
import type { GameEvents, MechEvent } from '../../sim/round/events';
import type { Action } from '@pichi/screen-kit/audio';

export const MECH_ACTIONS: { [K in MechEvent]: (p: GameEvents[K]) => Action[] } = {
  'mech:fire': () => [{ kind: 'play', id: 'fireStart' }],
  'mech:wiped': () => [{ kind: 'play', id: 'fireOut' }],
  'mech:spray': () => [{ kind: 'play', id: 'plink' }],
  'mech:drip': () => [{ kind: 'play', id: 'plink' }],
  'mech:bridgeBreak': () => [{ kind: 'play', id: 'thud' }],
  'mech:bridgeMend': () => [{ kind: 'play', id: 'ding' }],
  'mech:trayLoss': () => [{ kind: 'play', id: 'thud' }],
  'mech:need': () => [{ kind: 'play', id: 'ding' }],
};
