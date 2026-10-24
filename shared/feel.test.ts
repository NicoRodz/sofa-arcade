// Phase 1 "feel" rules of the overcooked-2 plan: R1 smoothing, R2 dash, R4 soft collision, R5 push, R6 input buffer.
import { describe, expect, it } from 'vitest';
import { SPEED, TICK_MS, addPlayer, createGame, tick, type Controls, type Game, type Player } from './overcooked';
import { TUNING, type Difficulty } from './difficulty';

export const idle: Controls = { x: 0, y: 0, a: 0, b: false };
export const step = (g: Game, c: Record<number, Partial<Controls>> = {}) =>
  tick(g, new Map(Object.entries(c).map(([id, v]) => [Number(id), { ...idle, ...v }])));
export const walk = (g: Game, ms: number, c: Record<number, Partial<Controls>> = {}) => { for (let t = 0; t < ms - 1e-6; t += TICK_MS) step(g, c); };
export function open(difficulty: Difficulty = 'normal', n = 2): Game { // map 1: an open kitchen
  const g = createGame({ difficulty, n });
  return g;
}
export const put = (p: Player, x: number, y: number, fx = 1, fy = 0) => { p.x = x; p.y = y; p.fx = fx; p.fy = fy; p.vx = 0; p.vy = 0; };

describe('R1 integrator (Normal)', () => {
  // The pre-R1 rule: position advances at stick * SPEED every tick, no memory of the previous velocity.
  const route: [number, number, number][] = [[1, 0, 1500], [0, 0, 400], [0, 1, 800], [0, 0, 400], [-1, 0, 1000], [0, 0, 400], [0, -1, 500], [0, 0, 400]];
  it('walks the same trajectory as the instant rule: every rest point within 5% of the distance travelled', () => {
    const g = open();
    const p = (addPlayer(g, 1, 0), g.players.get(1)!);
    put(p, 2.5, 2.5);
    let lx = 2.5, ly = 2.5, travelled = 0;
    for (const [x, y, ms] of route) {
      const steps = Math.round(ms / TICK_MS);
      for (let i = 0; i < steps; i++) { step(g, { 1: { x, y } }); lx += x * SPEED * (TICK_MS / 1000); ly += y * SPEED * (TICK_MS / 1000); }
      travelled += Math.hypot(x, y) * SPEED * (ms / 1000);
      if (x === 0 && y === 0) {
        const err = Math.hypot(p.x - lx, p.y - ly);
        expect(err, `rest point after ${travelled.toFixed(1)} tiles`).toBeLessThan(0.05 * travelled);
      }
    }
  });
  it('is smooth: it needs about 3 tau to reach cruise speed, and stops within 3 tau_stop', () => {
    const g = open();
    const p = (addPlayer(g, 1, 0), g.players.get(1)!);
    put(p, 2.5, 2.5);
    walk(g, TICK_MS, { 1: { x: 1 } });
    expect(p.vx).toBeGreaterThan(0.1 * SPEED);
    expect(p.vx).toBeLessThan(0.5 * SPEED); // the first tick does not jump to full speed
    walk(g, 200, { 1: { x: 1 } });
    expect(p.vx).toBeGreaterThan(0.95 * SPEED);
    walk(g, 300, {});
    expect(Math.abs(p.vx)).toBeLessThan(0.02);
  });
  it('Easy and Hard keep the instant rule (tau 0) until their own table row is tuned', () => {
    for (const d of ['easy', 'hard'] as const) {
      expect([TUNING[d].tauMs, TUNING[d].tauStopMs]).toEqual([0, 0]);
      const g = open(d);
      const p = (addPlayer(g, 1, 0), g.players.get(1)!);
      put(p, 2.5, 2.5);
      step(g, { 1: { x: 1 } });
      expect(p.vx).toBe(SPEED);
    }
  });
});
