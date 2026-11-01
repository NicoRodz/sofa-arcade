import { REACH, REACH_SLACK, isSolid, type Controls, type Game, type Player, type Station } from './state';
import { floorWins, magnetStation } from '../feel/magnet';
import { floorItemNear } from './hazards';
import { ASSIST_FACING_BONUS, ASSIST_REACH_MULT } from '../rules/assist';
import { unit } from './movement';

// The station in front of the chef, among the ones it may use (its own team's, or shared).
export function targetStation(g: Game, p: Player, plain = false): Station | null {
  // plain: the old probe even with the magnet on (what blocks a dash)
  if (p.assist) return assistStation(g, p);
  if (g.magnet && !plain) return magnetStation(g, p);
  const len = Math.hypot(p.fx, p.fy) || 1;
  const px = p.x + (p.fx / len) * REACH;
  const py = p.y + (p.fy / len) * REACH;
  let best: Station | null = null;
  let bestD = REACH_SLACK;
  for (const s of g.stations) {
    if (s.owner !== null && s.owner !== p.team) continue; // another team's kitchen: its stations are not there for this chef
    const d = Math.hypot(px - Math.max(s.tx, Math.min(px, s.tx + 1)), py - Math.max(s.ty, Math.min(py, s.ty + 1)));
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

// What A acts on: the target station, unless (magnetism, hazards) the chef faces a piece of rubbish at least as much as that station (feel/magnet.ts floorWins).
export function aStation(g: Game, p: Player): Station | null {
  const s = targetStation(g, p);
  return s && g.magnet && g.hazards && floorWins(p, s, floorItemNear(g, p)) ? null : s;
}

// Ayudante (assist.ts): the nearest usable station within ASSIST_REACH_MULT times the usual radius, whichever way the chef faces (a near tie goes to the one it
// already faces), and never through a wall. The normal rule measures from a probe in front of the chef; this one from the chef's centre to the station's tile.
const nearestPoint = (p: Player, s: Station): [number, number] => [
  Math.max(s.tx, Math.min(p.x, s.tx + 1)),
  Math.max(s.ty, Math.min(p.y, s.ty + 1)),
];
function assistStation(g: Game, p: Player): Station | null {
  const reach = (REACH + REACH_SLACK) * (ASSIST_REACH_MULT + (g.magnet?.assistExtra ?? 0));
  const len = Math.hypot(p.fx, p.fy) || 1;
  let best: Station | null = null,
    bestKey = Infinity;
  for (const s of g.stations) {
    if (s.owner !== null && s.owner !== p.team) continue;
    const [nx, ny] = nearestPoint(p, s);
    const dx = nx - p.x,
      dy = ny - p.y,
      d = Math.hypot(dx, dy);
    if (d > reach) continue;
    let clear = true; // a wall (or another station) between the chef and the point it would reach blocks it
    for (let t = 0.05; t < 0.96 && clear; t += 0.05) {
      const tx = Math.floor(p.x + dx * t),
        ty = Math.floor(p.y + dy * t);
      if ((tx !== s.tx || ty !== s.ty) && isSolid(g, tx, ty)) clear = false;
    }
    if (!clear) continue;
    const key = d - ASSIST_FACING_BONUS * (d > 1e-6 ? (dx * p.fx + dy * p.fy) / (len * d) : 1);
    if (key < bestKey) {
      best = s;
      bestKey = key;
    }
  }
  return best;
}
// Ayudante: is the stick pushing into the station (within 60 degrees of the way to it)? Walking into what you are chopping is not walking away.
export function pushesInto(p: Player, s: Station, c: Controls) {
  const [nx, ny] = nearestPoint(p, s);
  const dx = nx - p.x,
    dy = ny - p.y,
    d = Math.hypot(dx, dy),
    m = Math.hypot(c.x, c.y);
  return d > 1e-6 && m > 1e-6 && (c.x * dx + c.y * dy) / (m * d) > 0.5;
}
// Ayudante, stick idle: the chef turns to the station it will use (the screen draws it facing it).
export function faceStation(p: Player, s: Station) {
  const [nx, ny] = nearestPoint(p, s);
  const dx = nx - p.x,
    dy = ny - p.y;
  if (Math.hypot(dx, dy) > 1e-6) {
    const [ux, uy] = unit(dx, dy);
    p.fx = ux;
    p.fy = uy;
  }
}
