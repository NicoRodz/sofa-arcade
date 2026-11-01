// A5 part S2: the real sim (S1's campaign layer) plays the levels of Mundos 2 and 3. The validator carries what it models; these tests are the evidence for what it does not, and the
// check that what it does model also works with real bodies, ropes and platforms: scripted inputs for the cooperative tricks (ladder, super jump, balance, throw, key, pickaxe, mover)
// and ObstBot (which runs, jumps, climbs walls with the tower and hand, crosses boyas) for the dynamics that are only an obstacle (ice, wind, soft enemies).
import { describe, expect, it } from 'vitest';
import { PLAYER_H, TILE } from '../constants';
import { inp, of, pl, run, teleport, world } from '../sim/testkit/testkit';
import { playWithBots } from './tools/botplay';
import { CAMPAIGN } from './catalog/catalog';
import type { ObstEvent } from '../sim/world/state';
import type { WorldId } from '../sim/rules/campaign';

const def = (id: string) => CAMPAIGN.find((l) => l.id === id)!.def!;
const worldOf = (id: string): WorldId => CAMPAIGN.find((l) => l.id === id)!.world;
const camp = (id: string) => ({ campaign: { world: worldOf(id) } });
const B = (s: number) => (slot: number) => (slot === s ? inp({ grab: true }) : undefined);
const cx = (w: ReturnType<typeof world>, s: number) => pl(w, s).body.x + 17;
const row = (w: ReturnType<typeof world>, s: number) => Math.round((pl(w, s).body.y + PLAYER_H) / TILE) - 1;

describe('Bosque and Glaciar in the real sim: the cooperative tricks work with bodies, rope and platforms', () => {
  it('1-5: the thrown one crosses the 5-tile pit, the thrower is pulled across, and the quick-match throw of the same inputs falls short', () => {
    const play = (campaign: boolean) => {
      const w = world(def('1-5'), { mode: 'chain', ...(campaign ? camp('1-5') : {}) });
      const [a, b] = [pl(w, 0), pl(w, 1)];
      a.body.x = 31 * TILE + 8;
      a.body.y = 12 * TILE - PLAYER_H;
      b.body.x = 30 * TILE + 4;
      b.body.y = 12 * TILE - PLAYER_H;
      for (const p of [a, b]) {
        p.body.grounded = true;
        p.body.air = 0;
        p.body.facing = 1;
      }
      run(w, 5);
      run(w, 1, B(0));
      run(w, 3);
      run(w, 1, B(0)); // lift, throw
      let landed = false;
      const ev: ObstEvent[] = run(
        w,
        300,
        (s) => (s === 1 && b.body.grounded && !b.planted && !landed ? inp({ grab: true }) : undefined),
        () => {
          if (b.body.grounded && b.body.x > 37 * TILE - 20 && b.body.y + PLAYER_H <= 12 * TILE + 1) landed = true;
        },
      );
      if (b.planted) run(w, 1, B(1)); // the partner un-plants and walks on: the thrower is hauled up
      ev.push(...run(w, 400, () => inp({ move: 1 })));
      return { w, landed, deaths: of(ev, 'obst.death').length };
    };
    const c = play(true);
    expect(c.landed).toBe(true);
    expect(c.deaths).toBe(0);
    expect(c.w.players.every((p) => p.body.x > 36 * TILE)).toBe(true);
    expect(play(false).landed).toBe(false);
  });

  it('2-1: both climb the 7-tile trunk by its ladder and come down the far side; without climbing they stay at its foot', () => {
    const ladderX = 26 * TILE + 24;
    const play = (climb: boolean) => {
      const w = world(def('2-1'), { mode: 'chain', ...camp('2-1') });
      run(w, 60 * 14, (s) => {
        const b = pl(w, s).body,
          x = cx(w, s);
        if (!climb) return inp({ move: 1 });
        if (x < ladderX - 8 && b.y > 7 * TILE) return inp({ move: 1 });
        if (b.y + PLAYER_H > 7 * TILE + 2 && Math.abs(x - ladderX) <= 10) return inp({ up: true });
        if (b.y + PLAYER_H <= 7 * TILE + 2 && x < 30 * TILE) return inp({ move: 1, up: true });
        return inp({ move: 1 });
      });
      return w;
    };
    const w = play(true);
    expect(
      w.players.map((p) => p.body.x / TILE),
      'climbers',
    ).toSatisfy((xs: number[]) => xs.every((x) => x > 33)); // past the trunk (26-32), on the floor beyond or in the water pit: nobody is left behind
    expect(
      play(false).players.map((p) => p.body.x / TILE),
      'walkers',
    ).toSatisfy((xs: number[]) => xs.every((x) => x < 27)); // the foot of the trunk (its face is column 27)
  });

  it('2-2 and 3-6: two jumps within 150 ms (up to 9 steps apart) put both on the 4-tile ledge across a 4-tile pit; 12 steps apart, or alone, they fall in', () => {
    for (const [id, lip, farCol] of [
      ['2-2', 52, 57],
      ['3-6', 36, 41],
    ] as const) {
      const play = (offset: number | null) => {
        const w = world(def(id), { mode: 'chain', ...camp(id) });
        teleport(w, 0, lip, 12);
        teleport(w, 1, lip - 1, 12);
        pl(w, 0).body.x = lip * TILE + TILE - 34 - 2;
        pl(w, 1).body.x = lip * TILE + TILE - 34 - 2 - 30; // flush at the lip, one behind the other
        run(w, 5);
        const t0 = w.tick;
        const ev = run(w, 120, (s) => {
          if (offset === null) return inp({ move: 1, jump: s === 0 && w.tick === t0 }); // alone
          return inp({ move: 1, jump: w.tick - t0 === (s === 0 ? 0 : offset) });
        });
        return { w, superJumps: of(ev, 'obst.superJump').length, deaths: of(ev, 'obst.death').length };
      };
      for (const offset of [0, 4, 9]) {
        const r = play(offset);
        expect(r.superJumps, `${id} offset ${offset}`).toBe(1);
        // nobody died crossing, and both are alive past the pit (the last one may hang on the rope: the edge assist lifts it; the script keeps running into the next pit after landing)
        expect(
          r.w.players.every((p) => p.body.x > (farCol - 1) * TILE),
          `${id} offset ${offset}`,
        ).toBe(true);
      }
      expect(play(12).superJumps).toBe(0);
      expect(play(12).deaths).toBeGreaterThan(0);
      expect(play(null).deaths).toBeGreaterThan(0);
    }
  });

  it('2-3: standing on the balance takes both down 4 rows (2 tiles/s) into the one-tile tunnel and out to the far side, alive', () => {
    const w = world(def('2-3'), { mode: 'chain', ...camp('2-3') });
    const deaths: string[] = [],
      balance: string[] = [];
    let maxOy = 0;
    for (let i = 0; i < 60 * 14 && !w.players.every((p) => p.body.x > 44 * TILE); i++) {
      const ev = run(w, 1, (s) => {
        const x = cx(w, s),
          g = pl(w, s).body.grounded;
        return inp({ move: 1, jump: g && x > 6.5 * TILE && x < 8.5 * TILE }); // hop the spikes on the plateau, then walk on: onto D, down, through the tunnel
      });
      deaths.push(...of(ev, 'obst.death').map((d) => d.cause));
      balance.push(...of(ev, 'obst.balance').map((b) => b.id));
      maxOy = Math.max(maxOy, w.ent.objectives.find((o) => o.letter === 'D')!.oy);
    }
    expect(w.players.every((p) => p.body.x > 44 * TILE)).toBe(true);
    expect(deaths).toEqual([]);
    expect(balance).toEqual(['D']);
    expect(maxOy).toBeCloseTo(4 * TILE, 0);
  });

  it('2-5: the key on the block opens the door when its holder walks up to it (Encadenados and Libres)', () => {
    for (const mode of ['chain', 'free'] as const) {
      const w = world(def('2-5'), { mode, ...camp('2-5') });
      teleport(w, 0, 22, 9);
      teleport(w, 1, 20, 11); // the block with the key (cols 21-23)
      const ev = run(w, 60 * 6, (s) => {
        const b = pl(w, s).body,
          x = cx(w, s);
        const hop = (c: number) => x > (c - 2.2) * TILE && x < (c - 0.4) * TILE && b.grounded; // the block with the key, then the door's own wall
        return inp({ move: 1, jump: hop(21) || hop(32) });
      });
      expect(
        of(ev, 'obst.gate').some((g) => g.id.startsWith('door:32,') && g.open),
        mode,
      ).toBe(true);
      expect(
        w.players.map((p) => p.body.x / TILE),
        mode,
      ).toSatisfy((xs: number[]) => xs.every((x) => x > 33));
    }
  });

  it('3-4: one takes the pickaxe and climbs the 8-tile wall in about 8 s, hands it down with B, the other climbs too and both end on top', () => {
    const w = world(def('3-4'), { mode: 'chain', ...camp('3-4') });
    teleport(w, 0, 20, 11);
    teleport(w, 1, 19, 11);
    run(w, 3);
    expect(w.ent.pickaxes[0]!.heldBy).toBe(0);
    teleport(w, 0, 43, 11);
    pl(w, 0).body.x = 44 * TILE - 34;
    pl(w, 0).body.facing = 1;
    teleport(w, 1, 41, 11);
    run(w, 3);
    const actions: string[] = [];
    const note = (ev: ObstEvent[]) => {
      for (const e of of(ev, 'obst.pickaxe')) actions.push(`${e.player}:${e.action}`);
    };
    for (let i = 0; i < 60 * 14 && !actions.includes('0:top'); i++) note(run(w, 1, (s) => (s === 0 ? inp({ up: true }) : inp())));
    expect(actions).toEqual(['0:climb', '0:top']);
    run(w, 5);
    note(run(w, 2, B(0)));
    for (let i = 0; i < 60 * 14 && !actions.includes('1:top'); i++)
      note(run(w, 1, (s) => (s === 1 ? inp({ up: true, move: pl(w, 1).camp.pick ? 0 : 1 }) : inp())));
    expect(actions).toEqual(['0:climb', '0:top', '0:pass', '1:climb', '1:top']);
    run(w, 60); // the mantle hop lands
    expect(w.players.map((p) => `${row(w, p.slot)}${p.body.grounded ? 'g' : ''}`)).toEqual(['3g', '3g']);
  });

  it('3-3: both ride the first mover across the lake and step off on the far shore', () => {
    const w = world(def('3-3'), { mode: 'chain', ...camp('3-3') });
    teleport(w, 0, 13, 11);
    teleport(w, 1, 12, 11);
    const A = () => w.ent.objectives.find((o) => o.letter === 'A')!;
    let stage = 0;
    const deaths: string[] = [];
    for (let i = 0; i < 60 * 12 && !(stage === 2 && [0, 1].every((k) => cx(w, k) > 31 * TILE)); i++) {
      const ev = run(w, 1, (s) => {
        const both = (f: (c: number) => boolean) => [0, 1].every((k) => f(cx(w, k)));
        if (stage === 0) {
          if (both((c) => c > 15.4 * TILE && c < 17.6 * TILE)) stage = 1;
          return inp({ move: cx(w, s) < 16.5 * TILE ? 1 : 0 });
        } // board it at the dock, stand on it
        if (stage === 1) {
          if (A().ox > 520) stage = 2;
          return inp();
        } // wait for it to reach the far side (11 tiles away)
        return inp({ move: 1 });
      });
      deaths.push(...of(ev, 'obst.death').map((d) => d.cause));
    }
    expect(stage).toBe(2);
    expect(deaths).toEqual([]);
    expect(w.players.map((p) => `${row(w, p.slot)}${p.body.grounded ? 'g' : ''}`)).toEqual(['11g', '11g']);
  });
});

describe('Bosque and Glaciar in the real sim: ObstBot (2 players) plays what the dynamics only make harder', () => {
  const play = (id: string, sec: number) => {
    const events: ObstEvent[] = [];
    const s = playWithBots(def(id), 2, CAMPAIGN.find((l) => l.id === id)!.mode === 'L' ? 'free' : 'chain', sec, camp(id).campaign, events);
    return { s, events };
  };
  const count = (events: ObstEvent[], name: string) => events.filter((e) => e.name === name).length;
  const cleared = (s: ReturnType<typeof playWithBots>) => s.world.status === 'cleared' && s.world.players.every((p) => p.inGoal);

  it('2-4: the bots press the plate and fly through the diana: both gates open and the level is cleared', { timeout: 60_000 }, () => {
    const { s, events } = play('2-4', 90);
    expect(cleared(s)).toBe(true);
    expect(count(events, 'obst.plate')).toBeGreaterThanOrEqual(1);
    expect(count(events, 'obst.target')).toBeGreaterThanOrEqual(1);
    expect(events.filter((e) => e.name === 'obst.gate' && (e.data as { open: boolean }).open).length).toBeGreaterThanOrEqual(2);
  });
  it('2-6 (soft enemies, Libres): the bots are shoved by the beetles (obst.enemy) and still finish; the enemies are never the only way', {
    timeout: 60_000,
  }, () => {
    const { s, events } = play('2-6', 90);
    expect(cleared(s)).toBe(true);
    expect(count(events, 'obst.enemy')).toBeGreaterThanOrEqual(1);
  });
  it('3-1 (ice): the bots step onto the ice (obst.ice) and cross the lake', { timeout: 60_000 }, () => {
    const { s, events } = play('3-1', 120);
    expect(cleared(s)).toBe(true);
    expect(count(events, 'obst.ice')).toBeGreaterThanOrEqual(1);
  });
  it('3-2 (wind): gusts are announced and blow (obst.wind), and the bots still cross', { timeout: 60_000 }, () => {
    const { s, events } = play('3-2', 120);
    expect(cleared(s)).toBe(true);
    const phases = events.filter((e) => e.name === 'obst.wind').map((e) => (e.data as { phase: string }).phase);
    expect(phases).toContain('warn');
    expect(phases).toContain('gust');
  });
  it('3-7 (l12 relocated): the avalanche does not catch the bots', { timeout: 60_000 }, () => {
    expect(cleared(play('3-7', 120).s)).toBe(true);
  });
});
