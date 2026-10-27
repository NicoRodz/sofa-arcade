// Phone labels (14 characters at most) of M: what A and B do for the chef in front of it. Pure, like hints.ts.
import type { IconId } from '@pichi/core/icons';
import type { Game, Player, Station } from '../../round/state';
import { handleOf, kneading, slot } from './state';

export type Label = { label: string; icon: IconId; off?: boolean };
const on = (label: string, icon: IconId): Label => ({ label, icon });
const off = (label: string, icon: IconId): Label => ({ label, icon, off: true });

export function kneaderA(g: Game, p: Player, s: Station): Label {
  if (!slot(g, s)) return off('Amasadora', 'chop');
  if (s.item === 'cut0') return !p.item ? on('Tomar masa', 'dough') : off('Manos llenas', 'dough');
  if (kneading(s)) return off('Amasando', 'chop');
  return p.item === 'raw0' ? on('Poner masa', 'dough') : off(p.item ? 'Solo masa' : 'Trae masa', 'dough');
}
/** B on M: hold it on a handle; with only one chef on it the label says another is missing (the phone is amber there). */
export function kneaderB(g: Game, p: Player, s: Station): Label {
  const st = slot(g, s);
  if (!st || !kneading(s)) return off('Picar', 'chop');
  const i = g.stations.indexOf(s);
  const mine = handleOf(g, i, p);
  if (mine < 0) return on('Ve a un asa', 'move');
  return st.hands[1 - mine] ? on('Amasar', 'chop') : on('Falta otro chef', 'chop');
}
