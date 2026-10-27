// Generator stamp of 'gate', implemented by T1b: the cellar with a plate. `GATE_TEMPLATE` is the sub-grid the generator pastes (the door D in the wall row, the porter's Z beside a K above it,
// the ovens below). The registry test pins `template` to [] while the generator (T1f) does not consume it, so the real one waits in GATE_TEMPLATE until T1f flips it.
import type { MechStamp } from '../../mech/types';

export const GATE_TEMPLATE: readonly string[] = ['.ZK..', '#D###', '.O.O.'];
export const gateStamp: MechStamp = { template: [] };
