import { describe, expect, it } from 'vitest';
import { CIRCUIT, SPAWNS_LEFT } from '../map';
import { createGrid, stepGrid, turnReport, type ControlPlan, type GridInput } from '../sim';
import { RouteBot } from './route-bot';

const UNITS_PER_TILE = 16;
const SPEED_UPS = 64;

/** Runs a bot alone over the circuit; returns the ticks it took and the sim to inspect. */
function lap(plan: ControlPlan) {
  const s = createGrid({ slots: [0], control: plan, durationTicks: 1_000_000 });
  const bot = new RouteBot(CIRCUIT);
  const b = s.bodies[0]!;
  let ticks = 0;
  while (!bot.done && ticks < 6000) {
    const inp: GridInput = bot.input(b);
    stepGrid(s, new Map([[0, inp]]));
    ticks++;
  }
  return { s, bot, ticks };
}

describe('scripted bot on the 10-checkpoint circuit (the reference of the F0 metric)', () => {
  for (const plan of ['A', 'B'] as const) {
    it(`plan ${plan}: reaches the 10 checkpoints in order, within 6 % of the ideal time`, () => {
      const { bot, ticks } = lap(plan);
      expect(bot.done).toBe(true);
      const [sx, sy] = SPAWNS_LEFT[0]!;
      const ideal = (new RouteBot(CIRCUIT).routeTiles([sx, sy]) * UNITS_PER_TILE * 60) / SPEED_UPS;
      expect(ticks).toBeGreaterThanOrEqual(ideal - 80); // the bot counts a checkpoint on tile entry, up to 8 units (75 ticks over 10) before its centre; it cannot beat the speed limit
      expect(ticks).toBeLessThanOrEqual(ideal * 1.06);
    });

    it(`plan ${plan}: a perfect player has no failed turns`, () => {
      const { s } = lap(plan);
      const r = turnReport(s);
      expect(r.requested).toBeGreaterThan(5); // the route does turn
      expect(r.failed).toBe(0);
      expect(r.failedRate).toBe(0);
    });
  }
});
