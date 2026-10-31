// The rat as the imperfect chef (feel/rat-bot.ts) meets it: the gentle rat is scared in at least 70% of its events inside its window, the old rat is not, and the gentle one
// never steals in its first second nor leaves before 12 s. Half of the chefs have their hands full (a dash needs them free).
import { describe, expect, it } from 'vitest';
import { FIXED_MAPS, isFloor } from '../maps';
import { addPlayer, createGame, tick } from '../overcooked';
import type { Sim } from './human-bot';
import { runRat, type RatRun } from './rat-bot';
import { RAT_GENTLE } from './rat';

const sim: Sim = { createGame, addPlayer, tick, isFloor, maps: FIXED_MAPS.slice(0, 15) };
async function events(opts: Record<string, unknown>, seeds = 4): Promise<RatRun[]> {
  const out: RatRun[] = [];
  for (let mi = 0; mi < sim.maps.length; mi++)
    for (let s = 1; s <= seeds; s++) {
      const r = await runRat(sim, mi, s, { difficulty: 'normal', ...opts });
      if (r) out.push(r);
    }
  return out;
}
const rate = (rs: RatRun[]) => rs.filter((r) => r.caught).length / rs.length;

describe('the imperfect chef against the rat', () => {
  it('reaches the gentle rat in at least 70% of the events, hands full or not; the old rat in under 40%', async () => {
    const on = await events({ magnet: true, hazardsV2: false }), // the first gentle rat (HAZARD_V2 off)
      off = await events({});
    expect(on.length).toBeGreaterThanOrEqual(50);
    expect(rate(on)).toBeGreaterThanOrEqual(0.7);
    expect(rate(on.filter((r) => r.carry))).toBeGreaterThanOrEqual(0.7);
    expect(rate(off)).toBeLessThan(0.4);
    expect(rate(off.filter((r) => r.carry))).toBe(0); // a dash needs free hands: the old rat is out of reach of a cook
  });
  it('the gentle rat never steals in the first second and a rat nobody scares stays 12 s; the old one does steal at once and leaves earlier', async () => {
    const on = await events({ magnet: true }),
      off = await events({});
    const steals = on.filter((r) => r.stolen).map((r) => r.stealMs);
    expect(steals.length).toBeGreaterThan(10);
    expect(Math.min(...steals)).toBeGreaterThanOrEqual(RAT_GENTLE.graceMs);
    expect(Math.min(...on.filter((r) => !r.caught).map((r) => r.windowMs))).toBeGreaterThanOrEqual(RAT_GENTLE.minStayMs);
    expect(Math.min(...off.filter((r) => r.stolen).map((r) => r.stealMs))).toBeLessThan(RAT_GENTLE.graceMs);
    expect(Math.min(...off.filter((r) => !r.caught).map((r) => r.windowMs))).toBeLessThan(RAT_GENTLE.minStayMs);
  });
  it('HAZARD_V2 rat (it flees contact, pants after a burst): Normal is reached in 35-45% of the events, and still in 20%+ with full hands; Hard in 25-35%', async () => {
    const normal = await events({ magnet: true }, 12),
      hard = await events({ magnet: true, difficulty: 'hard' }, 12);
    expect(rate(normal)).toBeGreaterThanOrEqual(0.33);
    expect(rate(normal)).toBeLessThanOrEqual(0.47);
    expect(rate(normal.filter((r) => r.carry))).toBeGreaterThanOrEqual(0.17);
    expect(rate(hard)).toBeGreaterThanOrEqual(0.23);
    expect(rate(hard)).toBeLessThanOrEqual(0.37);
  });
});
