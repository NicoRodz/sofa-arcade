// EVENTS_V2: the labels of A and B near the things the events add: the light board (hold B), the candle drawer (A), the window with a cake that has no candle yet.
import type { IconId } from '@pichi/core/icons';
import { isDish } from '../recipes/defs';
import type { Game, Player } from '../round/state';
import { BOARD_RADIUS, near } from './state';

type Btn = { label: string; icon: IconId; off?: boolean };
export interface Ev2Hint {
  a?: Btn;
  b?: Btn;
}

export function ev2Hint(g: Game, p: Player): Ev2Hint | null {
  const e = g.ev2!;
  if (g.mid?.dark && e.board && near(p, e.board, BOARD_RADIUS + 0.5))
    return { b: { label: near(p, e.board) ? 'Subir luz' : 'Acércate', icon: 'star', off: !near(p, e.board) } }; // hold B at the board
  const k = e.cake;
  if (!k || k.closed || k.candled) return null;
  if (near(p, k.drawer)) return { a: { label: 'Vela', icon: 'star' } };
  const win = g.stations.find((s) => s.kind === 'window');
  if (win && isDish(p.item) && Math.hypot(p.x - (win.tx + 0.5), p.y - (win.ty + 0.5)) < 2.2 && p.item && g.teams[p.team]!.orders.some((o) => o.cake))
    return { a: { label: 'Falta la vela', icon: 'bell', off: true } };
  return null;
}
