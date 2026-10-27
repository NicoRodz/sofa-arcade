// Art of every mechanic by id (stubs in T0; each tanda fills its own draw.ts).
import type { MechId } from '../../../sim/mech/ids';
import type { MechArt } from '../../../sim/mech/types';
import { kneaderArt } from './kneader/draw';
import { woodOvenArt } from './woodOven/draw';
import { gateArt } from './gate/draw';
import { oilArt } from './oil/draw';
import { sprinklerArt } from './sprinkler/draw';
import { bridgeArt } from './bridge/draw';
import { oneWayArt } from './oneWay/draw';
import { raftArt } from './raft/draw';
import { beltReverseArt } from './beltReverse/draw';
import { ovenHeatArt } from './ovenHeat/draw';
import { heavyTrayArt } from './heavyTray/draw';
import { mutationArt } from './mutation/draw';

export const MECH_ART: Record<MechId, MechArt> = {
  kneader: kneaderArt,
  woodOven: woodOvenArt,
  gate: gateArt,
  oil: oilArt,
  sprinkler: sprinklerArt,
  bridge: bridgeArt,
  oneWay: oneWayArt,
  raft: raftArt,
  beltReverse: beltReverseArt,
  ovenHeat: ovenHeatArt,
  heavyTray: heavyTrayArt,
  mutation: mutationArt,
};
