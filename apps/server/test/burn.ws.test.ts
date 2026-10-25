// The oven that burns, over the relay: bots on websockets play a cooperative round of map 1 with the burn rules on. The phones send their inputs, the relay hands them
// to a Node "screen" that hosts the sim (one tick per frame), exactly like sabotage.ws.test.ts (the kit is in rules-kit.ts). One pizza is left to burn in an oven; the
// bots are scripted chefs: a cook (the golden recipe of golden/bot.ts), a firefighter (walks to what is burning and holds Picar in front of it) and an idle one.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DOUSE_MS, GRACE_MS } from '@pichi/game-pizzas/sim/burn';
import { startServer } from '../src/server';
import { kit, neglectedPizza, playRound } from './rules-kit';

beforeAll(async () => {
  kit.srv = await startServer({ port: 0, mode: 'none' });
});
afterAll(async () => {
  await kit.srv.close();
});

const flags = { burn: true, fire: true };
const burnAt = (ms: number) => {
  let done = false;
  return (g: Parameters<typeof neglectedPizza>[0]) => {
    if (!done && g.time >= ms) {
      done = true;
      neglectedPizza(g);
    }
  };
};

describe('the oven that burns over the relay', () => {
  it('nobody takes the pizza out and nobody puts the fire out: it burns after the grace time, catches fire 5 s later, jumps to the counters and stays lit to the end', async () => {
    const r = await playRound('bn1', { roles: ['idle', 'idle'], seconds: 40, flags, before: burnAt(2000) });
    expect(r.game.over).toBe(true);
    expect(r.of('oven:warn')).toHaveLength(1);
    expect(r.of('oven:burnt')).toHaveLength(1);
    expect(r.of('fire:start')).toHaveLength(1);
    expect(r.of('fire:spread').length).toBeGreaterThanOrEqual(1);
    expect(r.of('fire:out')).toHaveLength(0);
    expect(r.of('douseStart')).toHaveLength(0);
    expect(r.of('fire:start')[0]!.t - r.of('oven:burnt')[0]!.t).toBeGreaterThan(4900);
    expect(r.of('oven:burnt')[0]!.t - 2000).toBeGreaterThan(GRACE_MS.normal - 50);
    expect(r.game.stations.some((s) => s.fire !== undefined)).toBe(true);
    r.close();
  }, 60_000);

  it('a firefighter that walks to the flames and holds Picar through the phone puts them out in DOUSE_MS of match time, while the cook goes on cooking', async () => {
    const r = await playRound('bn2', { roles: ['firefighter', 'cook'], seconds: 60, flags, before: burnAt(2000) });
    expect(r.game.over).toBe(true);
    const out = r.of('fire:out');
    expect(out.length, 'fires put out').toBeGreaterThanOrEqual(1);
    expect(out.every((e) => e.p.player === r.phones[0]!.id)).toBe(true);
    expect(r.of('douseStart').length).toBeGreaterThanOrEqual(1);
    const start = r.of('fire:start')[0]!;
    expect(out[0]!.t - start.t).toBeGreaterThanOrEqual(DOUSE_MS - 20);
    expect(out[0]!.t - start.t).toBeLessThan(DOUSE_MS + 6000); // the walk there
    expect(r.of('fire:end').length).toBeGreaterThanOrEqual(1);
    expect(r.game.stations.some((s) => s.fire !== undefined)).toBe(false); // every flame is out by the end
    expect(r.game.delivered, 'the cook cooked').toBeGreaterThanOrEqual(1);
    r.close();
  }, 120_000);
});
