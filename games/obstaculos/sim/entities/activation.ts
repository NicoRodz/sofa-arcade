// Activators open objectives: plates, levers, targets (step 3).
import { DT } from '../../constants';
import { T } from '../../legend';
import type { Cell } from '../../types';
import { bodyRect, cellRect, overlaps, type PxRect } from '../world/collide';
import { emit, isActive, type Objective, type World } from '../world/state';
import { BOX_SIZE } from '../world/tuning';
import { setTile } from '../world/tiles';
import { requiredWeight } from './loads';

const px = (c: Cell): PxRect => cellRect(c.x, c.y);
// --- 3. activators open objectives
function setObjectiveCells(w: World, o: Objective, kind: number): void {
  for (const c of o.cells) setTile(w.grid, c.x, c.y, kind as never);
  w.tilesVersion++;
}
export const occupied = (w: World, cells: Cell[]): boolean => {
  const rs = cells.map(px);
  for (const p of w.players) if (p.connected && p.mode !== 'dead' && rs.some((r) => overlaps(r, bodyRect(p.body)))) return true;
  for (const b of w.ent.boxes) if (rs.some((r) => overlaps(r, { x: b.x, y: b.y, w: BOX_SIZE, h: BOX_SIZE }))) return true;
  return false;
};

// --- targets (campaign dynamic 5): touched in flight (feet off the ground) opens its gate for targetSec; touching it again restarts the clock
export function stepTargets(w: World): void {
  const c = w.camp;
  if (!c) return;
  for (const a of w.ent.activators) {
    if (a.kind !== 'target') continue;
    if (a.timer > 0) a.timer--;
    const hit = w.players.find(
      (p) =>
        isActive(p) &&
        !p.body.grounded &&
        !p.climbing &&
        p.camp.pick === 0 &&
        p.holding?.kind !== 'ring' &&
        overlaps(a.rect, bodyRect(p.body)),
    );
    if (!hit) continue;
    const fresh = a.timer === 0;
    a.timer = Math.round(c.targetSec / DT);
    if (fresh) emit(w, 'obst.target', { id: a.letter, player: hit.slot, seconds: c.targetSec });
  }
}

export function stepActivation(w: World): void {
  const n = w.players.filter((p) => p.connected).length;
  for (const a of w.ent.activators) {
    const was = a.pressed;
    if (a.kind === 'plate') {
      a.required = requiredWeight(a.weight, n);
      a.pressed = n > 0 && a.load >= a.required;
    } else if (a.kind === 'target') a.pressed = a.timer > 0;
    else a.pressed = a.holders.length > 0;
    if (a.pressed && a.latch) a.latched = true;
    if (a.kind === 'plate' && a.pressed !== was) emit(w, 'obst.plate', { id: a.letter, pressed: a.pressed, weight: a.load });
  }
  for (const o of w.ent.objectives) {
    if (o.kind === 'balance') continue;
    const want = o.hasOpener ? w.ent.activators.some((a) => a.opens === o.letter && (a.latch ? a.latched : a.pressed)) : o.kind !== 'gate';
    if (want === o.open) continue;
    if (o.kind === 'gate') {
      if (!want && occupied(w, o.cells)) continue; // a gate never closes on somebody: it waits
      o.open = want;
      setObjectiveCells(w, o, want ? T.Object : T.Door);
      emit(w, 'obst.gate', { id: o.letter, open: want });
    } else if (o.kind === 'ladder') {
      o.open = want;
      setObjectiveCells(w, o, want ? T.Ladder : T.Object);
    } else o.open = want;
  }
}
