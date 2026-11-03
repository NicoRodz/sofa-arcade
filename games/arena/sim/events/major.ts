// The four scheduled events: big pinata, rain, gold zone and vacuum robot. One runs at a time (the plan keeps them apart); `active` holds it.
import { MAP_W, solidAt } from '../../map';
import { clearTile } from '../match/board';
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';
import { BIG_FUSE_TICKS, BIG_RADIUS, BIG_WARN_TICKS, CLOCK_X, DURATION, GOLD_COLS, GOLD_ROWS, RAIN_TICKS, isActingPlus } from './config';
import { losingTeam } from './gap';
import type { Planned } from './plan';
import { startPlus, stepPlus } from './plus-step';
import { announce } from './state';
import { startVacuum, stepVacuum } from './vacuum';

/** The tile the big pinata lands on: the middle column, the floor tile nearest the map's centre row (the column is its own mirror image). */
export function bigTile(s: ManchazoState): [number, number] {
  const mid = Math.floor(s.grid.map.h / 2);
  for (let d = 0; d < s.grid.map.h; d++)
    for (const y of d === 0 ? [mid] : [mid - d, mid + d]) if (!solidAt(s.grid.map, CLOCK_X, y)) return [CLOCK_X, y];
  return [CLOCK_X, mid];
}

/** Adds or removes the golden zone's extra weight on the tiles already painted (the zone's tiles count double while it stands). */
function reweigh(s: ManchazoState, sign: 1 | -1): void {
  const m = s.match;
  const z = m.zone!;
  for (let y = z.y0; y <= z.y1; y++)
    for (let x = z.x0; x <= z.x1; x++) {
      const owner = m.paint[y * MAP_W + x]!;
      if (owner >= 0) m.counts[owner]! += sign * (2 - 1);
    }
}

export function startMajor(s: ManchazoState, p: Planned): void {
  const m = s.match;
  const ev = m.ev!;
  const t = s.grid.tick;
  ev.active = { kind: p.kind, start: t, end: t + DURATION[p.kind] };
  ev.next++;
  announce(ev, p.kind, t);
  if (p.kind === 'bigPinata') {
    const [x, y] = bigTile(s);
    ev.big = { x, y, landAt: t + BIG_WARN_TICKS };
  } else if (p.kind === 'rain') ev.rain = { done: 0 };
  else if (p.kind === 'gold') {
    m.zone = { x0: GOLD_COLS[0], x1: GOLD_COLS[1], y0: p.row, y1: p.row + GOLD_ROWS - 1 };
    reweigh(s, 1);
  } else if (p.kind === 'vacuum') startVacuum(s, p);
  else if (isActingPlus(p.kind)) startPlus(s, p.kind); // happy hour and the blackout are read off `active`
}

function stepBig(s: ManchazoState): void {
  const m = s.match;
  const ev = m.ev!;
  const big = ev.big!;
  if (s.grid.tick < big.landAt) return;
  const here = [0, 0];
  s.grid.bodies.forEach((b, i) => {
    const bm = m.bodies[i]!;
    const [x, y] = bodyTile(b, bm.face);
    if (bm.stun === 0 && x === big.x && y === big.y) here[b.team]!++;
  });
  if (here[0] === here[1]) return; // nobody, or a tie: it waits
  m.pinatas.push({
    id: m.nextId++,
    x: big.x,
    y: big.y,
    team: here[0]! > here[1]! ? 0 : 1,
    owner: -1,
    fuse: BIG_FUSE_TICKS,
    radius: BIG_RADIUS,
  });
  finish(s);
}

function stepRain(s: ManchazoState, p: Planned): void {
  const ev = s.match.ev!;
  const rain = ev.rain!;
  const elapsed = s.grid.tick - ev.active!.start + 1;
  const due = Math.min(p.order.length, Math.floor((p.order.length * elapsed) / RAIN_TICKS));
  for (; rain.done < due; rain.done++) {
    const i = p.order[rain.done]!;
    const [x, y] = [i % MAP_W, Math.floor(i / MAP_W)];
    clearTile(s.match, x, y, -2);
    clearTile(s.match, MAP_W - 1 - x, y, -2); // a drop and its mirror image
  }
}

/** Ends the active event (taken, gone or run out) and takes down what it left on the board. */
function finish(s: ManchazoState): void {
  const m = s.match;
  const ev = m.ev!;
  if (ev.active?.kind === 'gold' && m.zone) {
    reweigh(s, -1);
    m.zone = null;
  }
  ev.big = null;
  ev.rain = null;
  ev.vac = null;
  if (ev.plus) Object.assign(ev.plus, { contagion: null, move: null, balloon: null });
  ev.active = null;
}

export function stepMajor(s: ManchazoState): void {
  const ev = s.match.ev!;
  const t = s.grid.tick;
  if (ev.active && t >= ev.active.end) finish(s);
  if (!ev.active && ev.next < ev.program.length && t >= ev.program[ev.next]!.at) {
    // Contagio is not played when a team already trails by more than 15 %: it is skipped (the slot is spent, nothing is announced)
    if (ev.program[ev.next]!.kind === 'contagion' && losingTeam(s.match) >= 0) ev.next++;
    else startMajor(s, ev.program[ev.next]!);
  }
  const a = ev.active;
  if (!a) return;
  if (a.kind === 'bigPinata') stepBig(s);
  else if (a.kind === 'rain') stepRain(s, ev.program[ev.next - 1]!);
  else if (a.kind === 'vacuum') stepVacuum(s);
  else if (isActingPlus(a.kind)) stepPlus(s, a.kind);
}
