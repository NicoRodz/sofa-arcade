// The registry: every module in the fixed order (the order of MECH_IDS; hooks run in this order). T0 wires all twelve stubs; a tanda edits only its own folder.
import type { MechId } from './ids';
import type { MechModule } from './types';
import { kneaderModule } from './kneader/module';
import { woodOvenModule } from './woodOven/module';
import { gateModule } from './gate/module';
import { oilModule } from './oil/module';
import { sprinklerModule } from './sprinkler/module';
import { bridgeModule } from './bridge/module';
import { oneWayModule } from './oneWay/module';
import { raftModule } from './raft/module';
import { beltReverseModule } from './beltReverse/module';
import { ovenHeatModule } from './ovenHeat/module';
import { heavyTrayModule } from './heavyTray/module';
import { mutationModule } from './mutation/module';

export const MECH_MODULES: readonly MechModule[] = [
  kneaderModule,
  woodOvenModule,
  gateModule,
  oilModule,
  sprinklerModule,
  bridgeModule,
  oneWayModule,
  raftModule,
  beltReverseModule,
  ovenHeatModule,
  heavyTrayModule,
  mutationModule,
];
export const mechModule = (id: MechId): MechModule => MECH_MODULES.find((m) => m.id === id)!;
