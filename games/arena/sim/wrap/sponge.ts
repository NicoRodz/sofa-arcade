// The sponge v2 (PR6). First B: for SPONGE_SOAK_TICKS it turns the rival paint inside the diamond around you neutral and counts the tiles (`plus.soaked`). Second B, within
// SPONGE_HOLD_TICKS of the first (or by itself when the time is up): it squeezes a diamond of radius 2, or 3 from SPONGE_BIG_AT soaked tiles, in your colour where you stand.
// Stained while loaded, it bursts instead: radius 2 in the ATTACKER's colour. Every diamond is walked over floor, so walls and tape cut it (`blastTiles`).
import { MAP_W } from '../../map';
import { clearTile, paintTile } from '../match/board';
import { blastTiles } from '../match/blast';
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';
import { SQUEEZE_FX_TICKS } from '../sabotage/kinds';
import { BURST_RADIUS, SPONGE_BIG_AT, SPONGE_BIG_RADIUS, SPONGE_HOLD_TICKS, SPONGE_RADIUS, SPONGE_SOAK_TICKS } from './config';
import { tapeCut } from './tape';

/** The diamond of body i with `radius`, cut by walls and tape. */
function diamond(s: ManchazoState, i: number, radius: number): [number, number][] {
  const [x, y] = bodyTile(s.grid.bodies[i]!, s.match.bodies[i]!.face);
  return blastTiles(x, y, radius, s.grid.map, tapeCut(s));
}

/** Turns the rival paint of body i's diamond neutral; returns the tiles that really went neutral (a tape may refuse some). */
function soakAround(s: ManchazoState, i: number): number {
  const m = s.match;
  const team = s.grid.bodies[i]!.team;
  let n = 0;
  for (const [x, y] of diamond(s, i, SPONGE_RADIUS)) {
    const before = m.paint[y * MAP_W + x]!;
    if (before < 0 || before === team) continue;
    clearTile(m, x, y, team);
    if (m.paint[y * MAP_W + x] === -1) n++;
  }
  return n;
}

/** First B: starts soaking, or refuses (false) when there is no rival paint to take at all (the card is not spent). */
export function startSponge(s: ManchazoState, i: number): boolean {
  const plus = s.match.sab!.plus!;
  const n = soakAround(s, i);
  if (n === 0) return false;
  plus.sponge[i] = SPONGE_HOLD_TICKS;
  plus.soaked[i] = n;
  plus.wrap!.soak[i] = SPONGE_SOAK_TICKS;
  return true;
}

/** Second B (or the clock): paints the diamond in body i's colour and empties the sponge. */
export function squeezeSponge(s: ManchazoState, i: number): void {
  const plus = s.match.sab!.plus!;
  const n = plus.soaked[i]!;
  const radius = n >= SPONGE_BIG_AT ? SPONGE_BIG_RADIUS : SPONGE_RADIUS;
  const [x, y] = bodyTile(s.grid.bodies[i]!, s.match.bodies[i]!.face);
  for (const [tx, ty] of diamond(s, i, radius)) paintTile(s.match, tx, ty, s.grid.bodies[i]!.team, s.grid.tick);
  empty(s, i);
  plus.squeezeFx[i] = SQUEEZE_FX_TICKS;
  plus.wrap!.log.push({ kind: 'squeeze', tick: s.grid.tick, body: i, x, y, n });
}

function empty(s: ManchazoState, i: number): void {
  const plus = s.match.sab!.plus!;
  plus.sponge[i] = 0;
  plus.soaked[i] = 0;
  plus.wrap!.soak[i] = 0;
  if (s.match.sab!.held[i] === 'sponge') s.match.sab!.held[i] = null;
}

/** Reventón: body i has just been stained by `team` while loaded; the sponge bursts in the attacker's colour and the card is gone (it does not fall as loot). */
export function burstSponge(s: ManchazoState, i: number, team: number): void {
  const plus = s.match.sab?.plus;
  if (!plus?.wrap || plus.sponge[i]! === 0) return;
  const n = plus.soaked[i]!;
  const [x, y] = bodyTile(s.grid.bodies[i]!, s.match.bodies[i]!.face);
  for (const [tx, ty] of diamond(s, i, BURST_RADIUS)) paintTile(s.match, tx, ty, team, s.grid.tick);
  empty(s, i);
  plus.squeezeFx[i] = SQUEEZE_FX_TICKS;
  plus.wrap.log.push({ kind: 'burst', tick: s.grid.tick, body: i, x, y, n });
}

/** Clocks of the sponge, once per tick: it keeps soaking while the phase lasts, and squeezes itself when the hold time is up. */
export function stepSponge(s: ManchazoState): void {
  const plus = s.match.sab!.plus!;
  const w = plus.wrap!;
  s.grid.bodies.forEach((_b, i) => {
    if (plus.sponge[i]! === 0) return;
    if (w.soak[i]! > 0) {
      plus.soaked[i]! += soakAround(s, i);
      w.soak[i]!--;
    }
    if (--plus.sponge[i]! === 0) squeezeSponge(s, i);
  });
}
