// The stations message ('phase' puestos) parser, moved out of protocol.ts unchanged to leave that file room for the look (avatar) messages.
import { PUESTO_IDS, isPuestoId, type PuestoId } from '@pichi/game-pizzas/sim/puestos';
import type { PuestoAssign, PuestoMsg } from '../protocol';
import { MAX_PLAYERS, num } from './parse';

export const parsePuestoIds = (v: unknown, max = 4): PuestoId[] | null =>
  Array.isArray(v) && v.length <= max && v.every(isPuestoId) ? [...v] : null;
export function parsePuestoMsg(v: any): PuestoMsg | null {
  if (
    !v ||
    typeof v !== 'object' ||
    typeof v.cheese !== 'boolean' ||
    typeof v.sink !== 'boolean' ||
    !Array.isArray(v.assign) ||
    v.assign.length > MAX_PLAYERS
  )
    return null;
  const assign: PuestoAssign[] = [];
  for (const a of v.assign) {
    const puestos = parsePuestoIds(a?.puestos),
      pool = parsePuestoIds(a?.pool, PUESTO_IDS.length);
    if (!a || !num(a.id) || !puestos || !pool) return null;
    assign.push({ id: a.id, puestos, pool });
  }
  return { cheese: v.cheese, sink: v.sink, assign };
}
