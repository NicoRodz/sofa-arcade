// Soft enemies (campaign dynamic 6, plan §4): "escarabajos" that patrol a stretch of floor and SHOVE whoever touches them; they never hurt.
// A player that lands on one (falling onto its top) stuns it for `enemyStunSec` and hops; a stunned one is harmless. Only exists in a campaign world.
// A level lists them in LevelDef.enemies; N >= 4 adds `enemyExtra` more (+1 every 2 players beyond 2), cloned from that list walking the other way.
import { DT, JUMP_V0, MAX_FALL, PLAYER_H, PLAYER_W, TILE } from '../constants';
import { isOneWayKind, isSolidKind } from '../legend';
import type { ParsedLevel } from '../parse';
import type { CampaignParams } from './campaign';
import { bodyRect, overlaps, pushBody } from './collide';
import { emit, isActive, type EnemyE, type World } from './state';
import { boxHitsSolid, tileAt, tileOf, type TileGrid } from './tiles';
import { ENEMY_GRAVITY, ENEMY_H, ENEMY_PUSH_COOL, ENEMY_STOMP_BOUNCE, ENEMY_W } from './tuning';

export function createEnemies(p: ParsedLevel, camp: CampaignParams): EnemyE[] {
  const list = p.def.enemies ?? [];
  const make = (i: number, dir: 1 | -1): EnemyE => {
    const d = list[i % list.length]!;
    const cx = (d.x + 0.5) * TILE;
    return {
      x: cx - ENEMY_W / 2,
      y: (d.y + 1) * TILE - ENEMY_H,
      w: ENEMY_W,
      h: ENEMY_H,
      homeX: cx,
      range: d.range * TILE,
      dir,
      stun: 0,
      cool: 0,
      vy: 0,
    };
  };
  const out = list.map((_, i) => make(i, 1));
  if (list.length) for (let i = 0; i < camp.enemyExtra; i++) out.push(make(i, -1));
  return out;
}

const floorAt = (g: TileGrid, x: number, row: number): boolean => {
  const k = tileAt(g, tileOf(x), row);
  return isSolidKind(k) || isOneWayKind(k);
};

export function stepEnemies(w: World): void {
  const c = w.camp;
  if (!c || w.ent.enemies.length === 0) return;
  const speed = c.enemyTilesPerSec * TILE * DT;
  const push = c.enemyPushPxPerSec * DT;
  w.ent.enemies.forEach((e, i) => {
    if (e.cool > 0) e.cool--;
    const feet = e.y + e.h,
      cx = e.x + e.w / 2;
    if (!(floorAt(w.grid, cx, Math.round(feet / TILE)) && Math.abs(feet - Math.round(feet / TILE) * TILE) < 0.5)) {
      // no floor under it: fall until there is one
      e.vy = Math.min(MAX_FALL, e.vy + ENEMY_GRAVITY * DT);
      const dy = e.vy * DT,
        feetNew = feet + dy;
      let land = -1;
      for (let ty = Math.ceil((feet - 0.01) / TILE); ty <= Math.floor(feetNew / TILE); ty++)
        if (floorAt(w.grid, cx, ty)) {
          land = ty;
          break;
        }
      if (land >= 0) {
        e.y = land * TILE - e.h;
        e.vy = 0;
      } else e.y += dy;
      if (e.y > (w.level.h + 1) * TILE) {
        e.x = e.homeX - e.w / 2;
        e.y = 0;
        e.vy = 0;
      } // fell out of the level: back over its home
    } else e.vy = 0;
    if (e.stun > 0) e.stun--;
    else if (e.vy === 0) {
      const nx = e.x + e.dir * speed;
      const lead = nx + e.w / 2 + e.dir * (e.w / 2);
      const wall = boxHitsSolid(w.grid, nx, e.y + 2, e.w, e.h - 4);
      const ledge = !floorAt(w.grid, lead, Math.round((e.y + e.h) / TILE));
      if (wall || ledge || Math.abs(nx + e.w / 2 - e.homeX) > e.range) e.dir = e.dir === 1 ? -1 : 1;
      else e.x = nx;
    }
    if (e.stun > 0) return; // stunned: harmless, and nobody can stomp it again until it wakes
    const er = { x: e.x, y: e.y, w: e.w, h: e.h };
    for (const p of w.players) {
      if (!isActive(p) || p.carriedBy >= 0 || p.lift) continue;
      const b = p.body;
      if (!overlaps(bodyRect(b), er)) continue;
      if (b.vy > 0 && b.y + PLAYER_H - e.y <= e.h * 0.6 + b.vy * DT) {
        // landed on top: stun it, hop
        e.stun = Math.round(c.enemyStunSec / DT);
        b.vy = -JUMP_V0 * ENEMY_STOMP_BOUNCE;
        b.grounded = false;
        b.supportId = -1;
        b.air = 255;
        emit(w, 'obst.enemy', { enemy: i, action: 'stun', player: p.slot });
        return;
      }
      const dir = b.x + PLAYER_W / 2 >= e.x + e.w / 2 ? 1 : -1;
      pushBody(b, dir * push, 0, w.grid);
      if (e.cool === 0) {
        e.cool = ENEMY_PUSH_COOL;
        emit(w, 'obst.enemy', { enemy: i, action: 'push', player: p.slot });
      }
    }
  });
}
