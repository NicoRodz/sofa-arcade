// HAZARD_V3: the label of B in front of a broken bridge (hold B to mend it). Same pattern as the light board of eventsV2 (ev2/hint.ts): a hint that overrides the generic B.
import type { IconId } from '@pichi/core/icons';
import type { Game, Player } from '../../round/state';
import { frontOf } from '../oil/module';
import { repairable } from './module';

export function bridgeHint(g: Game, p: Player): { label: string; icon: IconId; off?: boolean } | null {
  if (!g.flags?.mech.bridge) return null;
  return repairable(g, frontOf(p)) ? { label: 'Reparar', icon: 'star' } : null;
}
