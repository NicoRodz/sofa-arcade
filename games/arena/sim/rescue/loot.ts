// Loot: the card a body carries when a rival blast stains it falls on the floor. Where it lands is the nearest valid tile (never a wall, a living part's tiles, a spawner
// or another loot), ties broken the same way on both sides of the map, so the placement is deterministic and the round still mirrors.
import { MAP_H, MAP_W, footprint, solidAt } from '../../map';
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';
import type { RescueState } from './state';

/** Tiles that must stay clear of loot: every tile a living part may occupy (brush sweep, sofa rail), the fountain, and the spawners. */
function reserved(s: ManchazoState): Set<number> {
  const out = new Set<number>();
  const live = s.match.live;
  if (live) {
    for (const p of live.pairs) for (const [x, y] of footprint(p.spec)) out.add(y * MAP_W + x);
    if (live.fountain) out.add(live.fountain.y * MAP_W + live.fountain.x);
  }
  for (const p of s.match.sab?.pickups ?? []) out.add(p.y * MAP_W + p.x);
  return out;
}

/** The valid tile nearest to (x0, y0): by Manhattan distance, then row, then toward the team's own side (team 0 the lower column, team 1 the higher: a left-right mirror agrees). */
export function lootTile(s: ManchazoState, r: RescueState, x0: number, y0: number, team: number, skip?: object): [number, number] {
  const keep = reserved(s);
  const taken = new Set(r.loot.filter((l) => l !== skip).map((l) => l.y * MAP_W + l.x));
  const ok = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && !solidAt(s.grid.map, x, y) && !keep.has(y * MAP_W + x) && !taken.has(y * MAP_W + x);
  for (let d = 0; d <= MAP_W + MAP_H; d++) {
    const ring: [number, number][] = [];
    for (let dy = -d; dy <= d; dy++) {
      const rest = d - Math.abs(dy);
      for (const dx of rest === 0 ? [0] : [-rest, rest]) if (ok(x0 + dx, y0 + dy)) ring.push([x0 + dx, y0 + dy]);
    }
    if (ring.length) return ring.sort((a, b) => a[1] - b[1] || (team === 0 ? a[0] - b[0] : b[0] - a[0]))[0]!;
  }
  return [x0, y0]; // unreachable on a map with any floor
}

/** Body i has just been stained: the card in its hand falls (a sponge loses what it soaked); with an empty hand, an armed Aguarras or Pegote falls instead. One loot per stain. */
export function dropLoot(s: ManchazoState, i: number): void {
  const m = s.match;
  const r = m.res;
  const a = m.sab;
  if (!r || !a) return;
  let kind = a.held[i] ?? null;
  let from = r.from[i]!;
  if (kind) {
    a.held[i] = null;
    if (kind === 'sponge' && a.plus) {
      a.plus.sponge[i] = a.plus.soaked[i] = 0; // the paint it soaked is lost; the card falls clean
      if (a.plus.wrap) a.plus.wrap.taken[i] = [];
    }
  } else if (a.armed[i]) {
    kind = a.armed[i]!;
    a.armed[i] = null;
    from = -1;
  }
  if (!kind) return;
  const b = s.grid.bodies[i]!;
  const [bx, by] = bodyTile(b, m.bodies[i]!.face);
  const [x, y] = lootTile(s, r, bx, by, b.team);
  r.loot.push({ x, y, kind, age: 0, owner: i, from });
  r.log.push({ kind: 'drop', tick: s.grid.tick, body: i, x, y, card: kind });
}
