// Phone labels (14 characters at most) of the bellows Q: B blows, and the label carries the fuel of the oven it feeds ("a fire bar for whoever blows").
import type { Game, Station } from '../../round/state';
import type { Label } from '../kneader/hint';
import { feedOf, fuelOf, woodCap } from './state';

export const bellowsA = (): Label => ({ label: 'Fuelle', icon: 'chop', off: true });
export function bellowsB(g: Game, q: Station): Label {
  const w = feedOf(g, g.stations.indexOf(q));
  if (w === undefined) return { label: 'Sin horno', icon: 'oven', off: true };
  const pct = Math.round((100 * fuelOf(g, w)) / woodCap(g));
  return { label: pct >= 100 ? 'Fuego lleno' : `Soplar ${pct}%`, icon: 'oven' };
}
