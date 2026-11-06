// Mano amiga (plan §5), moved out of actions.ts: a planted player at an edge catches a teammate who is falling in the sensor below the edge.
import { DT, PLAYER_H, PLAYER_W, TILE } from '../../constants';
import { isOneWayKind } from '../../legend';
import { bodyRect, type PxRect } from '../world/collide';
import { emit, isActive, type World } from '../world/state';
import { boxHitsSolid, tileAt, tileOf } from '../world/tiles';
import { HAND_LIFT_SEC } from '../world/tuning';

const NONE = 255;

export function handCatchStep(w: World, handZoneTiles: number): void {
  const steps = Math.round(HAND_LIFT_SEC / DT);
  for (const c of w.players) {
    if (!isActive(c) || !c.planted || !c.body.grounded || c.holding) continue;
    const cb = c.body,
      feet = cb.y + PLAYER_H;
    for (const dir of [cb.facing, -cb.facing] as const) {
      const probeX = dir > 0 ? cb.x + PLAYER_W + 2 : cb.x - 2;
      const edge = !boxHitsSolid(w.grid, probeX - 1, feet + 1, 2, 2) && !boxHitsOneWay(w, probeX, feet + 1);
      if (!edge) continue;
      const zone: PxRect = {
        x: dir > 0 ? cb.x + PLAYER_W - 4 : cb.x - 1.5 * TILE,
        y: feet - TILE / 2,
        w: 1.5 * TILE + 4,
        h: TILE / 2 + handZoneTiles * TILE,
      };
      for (const t of w.players) {
        if (
          t.slot === c.slot ||
          !isActive(t) ||
          t.lift ||
          t.carriedBy >= 0 ||
          t.holding?.kind === 'ring' ||
          t.climbing ||
          t.body.grounded ||
          t.body.vy < 0
        )
          continue;
        const r = bodyRect(t.body);
        if (r.x < zone.x + zone.w && r.x + r.w > zone.x && r.y < zone.y + zone.h && r.y + r.h > zone.y) {
          t.lift = { by: c.slot, t: 0, fx: t.body.x, fy: t.body.y };
          t.thrown = 0;
          c.stats.catches++;
          emit(w, 'obst.handCatch', { player: c.slot, target: t.slot });
        }
      }
      break;
    }
  }
  for (const t of w.players) {
    if (!t.lift) continue;
    const c = w.players.find((q) => q.slot === t.lift!.by);
    if (!c || !isActive(c) || !c.planted || !isActive(t)) {
      t.lift = null;
      continue;
    }
    const l = t.lift;
    l.t++;
    const u = Math.min(1, l.t / steps);
    const dir = c.body.facing;
    let tx = c.body.x - dir * PLAYER_W * 0.9;
    if (boxHitsSolid(w.grid, tx, c.body.y, PLAYER_W, PLAYER_H)) tx = c.body.x;
    const ty = c.body.y;
    // Up first, then across: from below the ledge a straight diagonal would cut through the corner of the block and crush the lifted player.
    const smooth = (k: number) => {
      const c = Math.max(0, Math.min(1, k));
      return c * c * (3 - 2 * c);
    };
    t.body.y = l.fy + (ty - l.fy) * smooth(u / 0.6);
    t.body.x = l.fx + (tx - l.fx) * smooth((u - 0.6) / 0.4);
    t.body.vx = 0;
    t.body.vy = 0;
    if (u >= 1) {
      t.lift = null;
      t.body.air = NONE;
    }
  }
}
const boxHitsOneWay = (w: World, x: number, y: number): boolean => isOneWayKind(tileAt(w.grid, tileOf(x), tileOf(y)));
