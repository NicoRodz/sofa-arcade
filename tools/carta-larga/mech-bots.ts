// Bot job of every mechanic by id (stubs in T0; each tanda fills its own mech/<id>.ts).
import type { MechId } from '@pichi/game-pizzas/sim/mech/ids';
import type { MechBot } from '@pichi/game-pizzas/sim/mech/types';
import { kneaderBot } from './mech/kneader';
import { woodOvenBot } from './mech/woodOven';
import { gateBot } from './mech/gate';
import { oilBot } from './mech/oil';
import { sprinklerBot } from './mech/sprinkler';
import { bridgeBot } from './mech/bridge';
import { oneWayBot } from './mech/oneWay';
import { raftBot } from './mech/raft';
import { beltReverseBot } from './mech/beltReverse';
import { ovenHeatBot } from './mech/ovenHeat';
import { heavyTrayBot } from './mech/heavyTray';
import { mutationBot } from './mech/mutation';

export const MECH_BOTS: Record<MechId, MechBot> = {
  kneader: kneaderBot,
  woodOven: woodOvenBot,
  gate: gateBot,
  oil: oilBot,
  sprinkler: sprinklerBot,
  bridge: bridgeBot,
  oneWay: oneWayBot,
  raft: raftBot,
  beltReverse: beltReverseBot,
  ovenHeat: ovenHeatBot,
  heavyTray: heavyTrayBot,
  mutation: mutationBot,
};
