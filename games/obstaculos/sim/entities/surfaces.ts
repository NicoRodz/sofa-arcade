// Surfaces that move or change under a body: movers and balances (step 1), crumbling tiles and belts.
import { DT, PLAYER_H, PLAYER_W, TILE } from '../../constants';
import { T } from '../../legend';
import { emit, isActive, type CrumbleE, type Entities, type Objective, type PlayerState, type World } from '../state';
import { BELT_SPEED } from '../tuning';
import { setTile, tileAt, tileOf } from '../tiles';
import { CRUMBLE_BACK_SEC, CRUMBLE_FALL_SEC } from '../../constants';
import { occupied } from './activation';

// --- 1. movers and balance (plan §4 step 1)
export function stepMovers(w: World): void {
  for (const o of w.ent.objectives) {
    if (o.kind !== 'mover') {
      o.dx = 0;
      o.dy = 0;
      continue;
    }
    const prm = o.param as Extract<Objective['param'], { kind: 'mover' }>;
    const ox0 = o.ox,
      oy0 = o.oy;
    if (o.open) o.phase += DT;
    const f = 0.5 - 0.5 * Math.cos((2 * Math.PI * o.phase) / Math.max(0.1, prm.periodSec));
    o.ox = prm.dx * TILE * f;
    o.oy = prm.dy * TILE * f;
    o.dx = o.ox - ox0;
    o.dy = o.oy - oy0;
  }
  const byLetter = new Map(w.ent.objectives.map((o) => [o.letter, o]));
  for (const o of w.ent.objectives) {
    if (o.kind !== 'balance') continue;
    const prm = o.param as Extract<Objective['param'], { kind: 'balance' }>;
    const q = byLetter.get(prm.partner);
    if (!q) continue;
    if (o.letter > q.letter) continue; // handled by the lower letter
    const oy0 = o.oy,
      qy0 = q.oy;
    const c = w.camp; // campaign (dynamic 4): ANY difference moves it (also against an empty plate) at a fixed speed; the legacy rule needs both plates loaded
    if (c ? o.load !== q.load : o.load > 0 && q.load > 0 && o.load !== q.load) {
      const step = (c ? c.balanceTilesPerSec : prm.speed) * TILE * DT; // the balance is not a hazard: difficulty does not scale it
      o.oy += o.load > q.load ? step : -step;
      const lim = prm.travel * TILE;
      o.oy = Math.max(-lim, Math.min(lim, o.oy));
    }
    q.oy = -o.oy;
    o.dx = 0;
    q.dx = 0;
    o.dy = o.oy - oy0;
    q.dy = q.oy - qy0;
    const moving = Math.abs(o.dy) > 1e-9;
    if (c && moving && !o.moving)
      emit(w, 'obst.balance', { id: o.load > q.load ? o.letter : q.letter, other: o.load > q.load ? q.letter : o.letter }); // the heavier plate and its partner
    o.moving = moving;
    q.moving = moving;
  }
}

// --- crumbling tiles (plan §9 '!')
export function stepCrumbles(w: World): void {
  const fall = Math.round(CRUMBLE_FALL_SEC / DT),
    back = Math.round(CRUMBLE_BACK_SEC / DT);
  const standing = w.players.filter((p) => isActive(p) && p.body.grounded && p.body.supportId === -1);
  for (const c of w.ent.crumbles) {
    if (c.state === 0) {
      const top = c.y * TILE;
      if (
        standing.some((p) => Math.abs(p.body.y + PLAYER_H - top) <= 1 && p.body.x < (c.x + 1) * TILE && p.body.x + PLAYER_W > c.x * TILE)
      ) {
        c.state = 1;
        c.t = 0;
      }
    } else if (c.state === 1) {
      if (++c.t >= fall) {
        c.state = 2;
        c.t = 0;
        setTile(w.grid, c.x, c.y, T.Empty);
        w.tilesVersion++;
      }
    } else if (c.t < back) c.t++;
    else if (!occupied(w, [{ x: c.x, y: c.y }])) {
      c.state = 0;
      c.t = 0;
      setTile(w.grid, c.x, c.y, T.Crumble);
      w.tilesVersion++;
    }
  }
}
export const crumbleAt = (ent: Entities, x: number, y: number): CrumbleE | undefined => ent.crumbles.find((c) => c.x === x && c.y === y);

// --- belts: a body standing on '<' or '>' is carried at BELT_SPEED
export function beltDx(w: World, p: PlayerState): number {
  const b = p.body;
  if (!b.grounded || b.supportId !== -1) return 0;
  const row = Math.round((b.y + PLAYER_H) / TILE);
  let dx = 0;
  for (let tx = tileOf(b.x), end = tileOf(b.x + PLAYER_W - 1e-6); tx <= end; tx++) {
    const k = tileAt(w.grid, tx, row);
    if (k === T.BeltR) dx = BELT_SPEED * DT;
    else if (k === T.BeltL) dx = -BELT_SPEED * DT;
    if (dx !== 0) break;
  }
  return dx;
}
