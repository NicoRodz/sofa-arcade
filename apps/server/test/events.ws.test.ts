// The mid-round events over the relay: bots on websockets (rules-kit.ts). A rat steals the dish left on a counter and leaves with it; a ratcatcher phone that runs at it and
// dashes scares it and the dish comes back; a rush brings three orders at once to a team that is cooking; a blackout stops the oven while a cook waits at it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RUSH_ORDERS } from '@pichi/game-pizzas/sim/midround';
import { startServer } from '../src/server';
import { forceEvent, kit, playRound } from './rules-kit';

beforeAll(async () => {
  kit.srv = await startServer({ port: 0, mode: 'none' });
});
afterAll(async () => {
  await kit.srv.close();
});

const flags = { events: true };
/** A raw tomato waits on a counter in the middle of the left wall: the rat has something to steal. */
const bait = (g: Parameters<typeof forceEvent>[0]) => {
  g.stations.filter((s) => s.kind === 'counter')[6]!.item = 'raw1';
};

describe('mid-round events over the relay', () => {
  it('the rat steals the item from the counter and leaves with it when nobody looks', async () => {
    const r = await playRound('ev1', {
      roles: ['idle', 'idle'],
      seconds: 30,
      flags,
      setup: (g) => {
        forceEvent(g, 'rat', 3000);
        bait(g);
      },
    });
    expect(r.game.over).toBe(true);
    expect(r.of('rat:appear')).toHaveLength(1);
    expect(r.of('rat:steal')).toHaveLength(1);
    expect(r.of('rat:scared')).toHaveLength(0);
    expect(r.of('rat:gone')[0]!.p).toEqual({ stolen: true });
    expect(r.game.stations.filter((s) => s.kind === 'counter').every((s) => s.item === null)).toBe(true);
    r.close();
  }, 60_000);

  it('a phone that runs at the rat and dashes scares it: the item goes back to the counter', async () => {
    const r = await playRound('ev2', {
      roles: ['ratcatcher', 'idle'],
      seconds: 30,
      flags,
      setup: (g) => {
        forceEvent(g, 'rat', 3000);
        bait(g);
      },
    });
    expect(r.game.over).toBe(true);
    expect(r.of('dash').length, 'the phone dashed').toBeGreaterThanOrEqual(1);
    const scared = r.of('rat:scared');
    expect(scared.length).toBeGreaterThanOrEqual(1);
    expect(scared[0]!.p.player).toBe(r.phones[0]!.id);
    expect(r.of('rat:gone').length).toBe(1);
    const stolen = r.of('rat:steal').length;
    if (stolen) expect(scared[0]!.p.returned).toBe(true); // it had taken it: it dropped it back
    expect(r.game.stations.filter((s) => s.kind === 'counter' && s.item === 'raw1')).toHaveLength(1); // the item is where it was
    r.close();
  }, 60_000);

  it('a rush brings three orders at once while a cook goes on delivering', async () => {
    const r = await playRound('ev3', { roles: ['cook', 'cook'], seconds: 40, flags, setup: (g) => forceEvent(g, 'rush', 8000) });
    expect(r.game.over).toBe(true);
    const at = r.of('event:start')[0]!.t;
    const burst = r.of('orderNew').filter((e) => e.t >= at - 20 && e.t <= at + 40);
    expect(burst).toHaveLength(RUSH_ORDERS);
    expect(new Set(burst.map((e) => e.t)).size).toBe(1); // the same tick
    expect(r.game.delivered).toBeGreaterThanOrEqual(1);
    r.close();
  }, 60_000);

  it('a blackout: no oven makes progress while the lights are out, even with two cooks working', async () => {
    const dark: number[][] = []; // the progress of every oven, each frame of the blackout
    let at = 0;
    const r = await playRound('ev4', {
      roles: ['cook', 'cook'],
      seconds: 40,
      flags,
      setup: (g) => forceEvent(g, 'blackout', 12_000),
      before: (g) => {
        if (g.mid!.dark) {
          at ||= g.time;
          dark.push(g.stations.filter((s) => s.kind === 'pot' && !s.done).map((s) => s.progress));
        }
      },
    });
    expect(r.game.over).toBe(true);
    expect(r.of('event:start')).toHaveLength(1);
    expect(r.of('event:end')).toHaveLength(1);
    expect(r.game.mid!.dark).toBe(false);
    expect(dark.length).toBeGreaterThan(500); // ~10 s of frames
    const first = dark[0]!;
    expect(
      first.some((v) => v > 0),
      'an oven was cooking when the lights went out',
    ).toBe(true);
    for (const frame of dark.slice(1)) expect(frame.filter((v, i) => v > (first[i] ?? Infinity) + 1e-9).length).toBe(0); // nobody got further than at the start
    r.close();
  }, 60_000);
});
