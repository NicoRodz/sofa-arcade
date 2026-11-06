// Scenarios of the A5/A6 dynamics for the two-bot tests (obst.dynamics.ws.test.ts): a small level per dynamic and the "phone" that plays each slot. A controller sees what the
// screen sees (the world's snapshot) and answers with the stick and the two buttons, exactly like a phone; the ws test turns every answer into packets through the relay.
// The scenarios live in obst.dynamics.a5.ts and obst.dynamics.a6.ts, their helpers in obst.dynamics.kit.ts.

import { balance, target, enemies, ice, wind, pickaxe, throwNiche } from './obst.dynamics.a5';
import { lantern, bungee, sinkers, geyser, layer } from './obst.dynamics.a6';
import type { Scenario } from './obst.dynamics.kit';
export type { Ctrl, Scenario } from './obst.dynamics.kit';

export const SCENARIOS: Record<string, () => Scenario> = {
  balance,
  target,
  enemies,
  ice,
  wind,
  pickaxe,
  throw: throwNiche,
  lantern,
  bungee,
  sinkers,
  geyser,
  layer,
};
