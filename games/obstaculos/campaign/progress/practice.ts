// Sala de practica (plan §2): one station per action, with a ghost silhouette and a target ring (the level's G), no hearts. A station opens when its
// mechanic debuts in the campaign (`opensAt`). Stations of mechanics the validator models are tested like levels: only the bot that knows the
// mechanic finishes them.
import { isModeled, type Mechanic } from '../../mechanics';
import { validateState } from '../../validator';
import { STATION_LEVELS } from '../worlds/stations';
import { campaignEnv } from './learning';
import type { PracticeStation } from '../catalog/types';

const st = (
  id: keyof typeof STATION_LEVELS,
  name: string,
  mechanics: Mechanic[],
  requires: Mechanic[],
  opensAt: string,
): PracticeStation => ({
  id,
  name,
  mechanics,
  requires,
  opensAt,
  mode: STATION_LEVELS[id].tether === 'freeOnly' ? 'L' : 'E',
  def: STATION_LEVELS[id],
  hearts: 'infinite',
  silhouette: true,
});

export const PRACTICE: readonly PracticeStation[] = [
  st('p-move', 'Mover', ['move'], [], '1-1'),
  st('p-jump', 'Saltar', ['jump', 'coyote'], [], '1-1'),
  st('p-rope', 'Cuerda', ['rope'], ['jump'], '1-2'),
  st('p-signals', 'Señales', ['signals'], ['jump'], '1-2'),
  st('p-tower', 'Torre y mano', ['tower', 'hand'], ['jump'], '1-3'),
  st('p-anchor', 'Ancla', ['anchor'], ['jump', 'tower', 'hand'], '1-4'),
  st('p-throw', 'Lanzamiento', ['throw'], ['jump', 'hand'], '1-5'),
  st('p-swing', 'Columpio', ['swing'], ['jump'], '1-6'),
];

export interface StationReport {
  id: string;
  ok: boolean;
  errors: string[];
  verified: Mechanic[];
  unverified: Mechanic[];
}

// The bot that knows the station's mechanics (and `requires`) finishes it and uses each modeled one; the bot without it fails.
export function learnStation(s: PracticeStation): StationReport {
  const errors: string[] = [];
  const mode = s.mode === 'L' ? 'free' : 'chain';
  const all = new Set<Mechanic>([...s.mechanics, ...s.requires]);
  const r = validateState(s.def, campaignEnv('beach', mode, all));
  if (!r.ok) errors.push(`${s.id}: not solvable with ${[...all].join(', ')}: ${r.errors.join('; ')}`);
  const verified: Mechanic[] = [],
    unverified: Mechanic[] = [];
  for (const x of s.mechanics) {
    if (!isModeled(x)) {
      unverified.push(x);
      continue;
    }
    verified.push(x);
    const without = new Set([...all].filter((m) => m !== x));
    if (validateState(s.def, campaignEnv('beach', mode, without)).ok) errors.push(`${s.id}: finishes without ${x}`);
    if (r.ok && (r.uses[x] ?? 0) < 1) errors.push(`${s.id}: the bot that knows ${x} finishes without using it`);
  }
  if (s.def.hints?.length) errors.push(`${s.id}: a station has no hints (the silhouette teaches)`);
  return { id: s.id, ok: errors.length === 0, errors, verified, unverified };
}
