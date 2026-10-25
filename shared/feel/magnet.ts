// Magnetism ("the controls got hard to aim", docs/feel/diagnostico.md): every chef, not only the Ayudante, gets help landing an interaction.
// Pure and deterministic. The sim reads it only when `game.magnet` is set (config `magnet`, off by default in createGame, so the goldens, the mirror
// proof and every hash keep their exact old values; the lobby switches it on: `normal` in Normal and Hard, `strong` in Easy).
//
//  1. TARGET BY SCORE, not by a probe: the usable station that is nearest to the chef (centre to the station's edge, within reach x1.3) minus a bonus for
//     the one it heads for (facing, a little velocity), inside a generous cone. The old probe fell on the neighbour of the station the chef looked at
//     (2 of 3 first presses landed), and a bigger probe only made that worse.
//  2. AUTO-ORIENT: Tomar / Picar turn the chef to its target before they act (the screen draws it facing the station).
//  3. MAGNET: a chef that moves slowly (or rests) less than `pullGap` from a station turns towards it, `pullDps` degrees per second, unless the stick is
//     held (the stick always wins: nothing here ever moves the chef, so walking past a counter is not a trap).
//  4. DASH HUG: a dash that ends within `hugMax` of a station right in front of it goes on (a few ms) until it touches it.
//  5. Feel: inertia and the dash/buffer knobs from MAGNET_TUNING replace the difficulty's (`tuneFor`): a quicker stick, a shorter dash cooldown.
// The Ayudante keeps its own rules (assist.ts) and reach x1.5, plus `assistExtra` of reach more when the magnet is on.
import { isFloor } from '../maps';
import type { Difficulty, Tuning } from '../difficulty';
import type { Game, Player, Station } from '../overcooked';

export type MagnetLevel = 'normal' | 'strong';
export const MAGNET_OPTION = 'magnet'; // lobby option (false switches it off for the round); missing = the difficulty's default
export const BASE_REACH = 1.1; // REACH + REACH_SLACK of the plain rule: the reach the multipliers scale (feel/magnet.test.ts pins it to the sim's constants)
export const CHEF_RADIUS = 0.35; // = RADIUS of the sim (pinned too)
const TOUCH = CHEF_RADIUS + 0.1; // from here a station is "touching": the cone no longer matters for which one is nearest, only the score

/** TUNING of the magnet, one table. Every number is a first guess that docs/feel/diagnostico.md measured with the human bot (tools/feel-measure.ts --opts '{"magnet":true}'). */
export interface MagnetCfg {
  level: MagnetLevel;
  reachMult: number; // interaction radius, times the plain one (BASE_REACH)
  assistExtra: number; // Ayudante: added to ASSIST_REACH_MULT
  coneDeg: number; // a station further than TOUCH must lie within this angle of where the chef heads
  facingBonus: number; // tiles: the station the chef heads for counts this much nearer (and the one behind it this much farther)
  pullDps: number; // the slow pull towards the target: degrees per second of facing
  pullGap: number; // ...only within this gap (tiles from the chef's body to the station's edge)
  pullSpeed: number; // ...and only below this speed (tiles/s)
  hugMax: number; // a dash that ends this far (tiles from the body) from a station in front of it goes on until it touches
  hugConeDeg: number;
  tauMs: number; // R1 inertia while the stick is held: the lower of this and the difficulty's (Easy and Hard are already instant)
  tauStopMs: number;
  dashCdMs: number; // the lower of this and the difficulty's
  bufferMs: number; // the higher of this and the difficulty's
}
export const MAGNET_TUNING: Record<MagnetLevel, MagnetCfg> = {
  normal: { level: 'normal', reachMult: 1.3, assistExtra: 0.2, coneDeg: 80, facingBonus: 0.1, pullDps: 720, pullGap: 0.6, pullSpeed: 1.5, hugMax: 0.9, hugConeDeg: 30, tauMs: 35, tauStopMs: 30, dashCdMs: 450, bufferMs: 200 },
  strong: { level: 'strong', reachMult: 1.5, assistExtra: 0.2, coneDeg: 85, facingBonus: 0.08, pullDps: 1080, pullGap: 0.8, pullSpeed: 2, hugMax: 1.1, hugConeDeg: 40, tauMs: 25, tauStopMs: 20, dashCdMs: 400, bufferMs: 250 },
};

/** The lobby's rule for a round: Easy gets the strong magnet, the rest the normal one; `magnet: false` in the mode options turns it off. */
export const magnetFor = (modeOptions: Readonly<Record<string, boolean | number | string>> | undefined, d: Difficulty): MagnetLevel | false =>
  modeOptions?.[MAGNET_OPTION] === false ? false : d === 'easy' ? 'strong' : 'normal';

/** The difficulty's feel knobs with the magnet's on top. */
export const tuneFor = (t: Tuning, m: MagnetCfg): Tuning => ({ ...t, tauMs: Math.min(t.tauMs, m.tauMs), tauStopMs: Math.min(t.tauStopMs, m.tauStopMs), dashCdMs: Math.min(t.dashCdMs, m.dashCdMs), bufferMs: Math.max(t.bufferMs, m.bufferMs) });

/** Switches the magnet on for a round (createGame calls it when its `magnet` option is set). */
export function applyMagnet(g: Game, level: MagnetLevel) {
  const cfg = MAGNET_TUNING[level];
  g.magnet = cfg;
  g.params = { ...g.params, tune: tuneFor(g.params.tune, cfg) };
}

const nearest = (p: Player, s: Station): [number, number] => [Math.max(s.tx, Math.min(p.x, s.tx + 1)), Math.max(s.ty, Math.min(p.y, s.ty + 1))];
const usable = (p: Player, s: Station) => s.owner === null || s.owner === p.team; // another team's kitchen is not there for this chef
// A wall (or another station) between the chef and the point it would reach blocks it.
function clear(g: Game, p: Player, s: Station, nx: number, ny: number) {
  const dx = nx - p.x, dy = ny - p.y;
  for (let t = 0.1; t < 0.96; t += 0.1) { const tx = Math.floor(p.x + dx * t), ty = Math.floor(p.y + dy * t); if ((tx !== s.tx || ty !== s.ty) && !isFloor(g.grid, tx, ty)) return false; }
  return true;
}
// Where the chef heads: its facing, plus the way it is moving when it moves with some speed.
function heading(p: Player): [number, number] {
  let hx = p.fx, hy = p.fy;
  const fl = Math.hypot(hx, hy) || 1;
  hx /= fl; hy /= fl;
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 1.2) { hx += (0.6 * p.vx) / sp; hy += (0.6 * p.vy) / sp; const l = Math.hypot(hx, hy) || 1; hx /= l; hy /= l; }
  return [hx, hy];
}

/** The station A / B act on for a chef when the magnet is on: lowest score (distance - bonus * cos) among the usable ones in reach and in the cone. */
export function magnetStation(g: Game, p: Player): Station | null {
  const m = g.magnet!, reach = BASE_REACH * m.reachMult, cone = Math.cos((m.coneDeg * Math.PI) / 180);
  const [hx, hy] = heading(p);
  let best: Station | null = null, bestKey = Infinity;
  for (const s of g.stations) {
    if (!usable(p, s)) continue;
    const [nx, ny] = nearest(p, s), dx = nx - p.x, dy = ny - p.y, d = Math.hypot(dx, dy);
    if (d > reach) continue;
    const cos = d > 1e-6 ? (dx * hx + dy * hy) / d : 1;
    if (cos < cone) continue;
    if (d > TOUCH && !clear(g, p, s, nx, ny)) continue;
    const key = d - m.facingBonus * cos;
    if (key < bestKey) { best = s; bestKey = key; }
  }
  return best;
}

/** Turns the chef to the station at once (the press of Tomar / Picar). */
export function faceStation(p: Player, s: Station) {
  const [nx, ny] = nearest(p, s), dx = nx - p.x, dy = ny - p.y, d = Math.hypot(dx, dy);
  if (d > 1e-6) { p.fx = dx / d; p.fy = dy / d; }
}

/**
 * Once per tick for a chef that has a target: a press snaps the facing to it; otherwise a slow chef with the stick idle close to the station turns towards it at pullDps.
 */
export function magnetPull(g: Game, p: Player, s: Station, pressing: boolean, stickIdle: boolean, dtMs: number) {
  const m = g.magnet!;
  if (pressing) { faceStation(p, s); return; }
  if (!stickIdle) return; // a held stick is the player's say: no pull
  const [nx, ny] = nearest(p, s), dx = nx - p.x, dy = ny - p.y, d = Math.hypot(dx, dy);
  if (d - CHEF_RADIUS > m.pullGap || Math.hypot(p.vx, p.vy) > m.pullSpeed || d < 1e-6) return;
  const fl = Math.hypot(p.fx, p.fy) || 1, fx = p.fx / fl, fy = p.fy / fl;
  const diff = Math.atan2(fx * dy - fy * dx, fx * dx + fy * dy); // signed angle from the facing to the station
  const step = Math.min(Math.abs(diff), (m.pullDps * Math.PI / 180) * (dtMs / 1000)) * Math.sign(diff);
  const c = Math.cos(step), sn = Math.sin(step);
  p.fx = fx * c - fy * sn; p.fy = fx * sn + fy * c;
}

/**
 * The dash is ending: how many ms more it needs to touch a station that lies right in front of its direction (0: nothing to hug, or it already did).
 * Stateless: only a dash that has not been extended yet qualifies (its cooldown still counts from a normal-length dash).
 */
export function magnetHug(g: Game, p: Player, speed: number, tickMs: number): number {
  const m = g.magnet!, t = g.params.tune;
  if (p.dashCd < t.dashCdMs - t.dashMs - tickMs) return 0;
  const cone = Math.cos((m.hugConeDeg * Math.PI) / 180);
  let ms = 0, bestGap = Infinity;
  for (const s of g.stations) {
    if (!usable(p, s)) continue;
    const [nx, ny] = nearest(p, s), dx = nx - p.x, dy = ny - p.y, d = Math.hypot(dx, dy), gap = d - CHEF_RADIUS;
    if (gap < 0.03 || gap > m.hugMax || (dx * p.dashDx + dy * p.dashDy) / d < cone || !clear(g, p, s, nx, ny) || gap >= bestGap) continue;
    bestGap = gap; ms = (gap / speed) * 1000 + 8;
  }
  return ms;
}

/**
 * Hazards only. A with the magnet on: a piece of rubbish (or a dropped item) the chef is facing at least as much as the station beside it wins over that station, so a
 * janitor next to a counter still picks the banana-skin up (the old rule only looked at the floor when no station was in front, and the magnet finds one much more often).
 */
export function floorWins(p: Player, s: Station, f: { tx: number; ty: number } | null): boolean {
  if (!f) return false;
  const fl = Math.hypot(p.fx, p.fy) || 1, fx = p.fx / fl, fy = p.fy / fl;
  const [nx, ny] = nearest(p, s), sd = Math.hypot(nx - p.x, ny - p.y) || 1, fd = Math.hypot(f.tx + 0.5 - p.x, f.ty + 0.5 - p.y) || 1;
  return ((f.tx + 0.5 - p.x) * fx + (f.ty + 0.5 - p.y) * fy) / fd >= ((nx - p.x) * fx + (ny - p.y) * fy) / sd;
}
