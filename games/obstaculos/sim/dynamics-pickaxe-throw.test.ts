// Campaign dynamic 9 (pickaxe), the throw niche, and the determinism of a campaign world with every A5 dynamic on (plan §4, phase A5), in the real sim.

import { describe, expect, it } from 'vitest';
import { DT, PLAYER_H, TILE } from '../constants';
import { campaignParams } from './rules/campaign';
import { hall, inp, level, of, pl, run, teleport, world } from './testkit/testkit';
import { previewB, step } from './world';

const camp = (n?: number) => ({ campaign: { world: 'forest' as const, n } });
const B = (s: number) => (slot: number) => (slot === s ? inp({ grab: true }) : undefined);
const FLOOR = 13; // standing row of hall(40, 16)
const steps = (sec: number) => Math.round(sec / DT);

describe('dynamic 9: pickaxe (a role item: climb ice walls at 1 tile/s, pass it with B)', () => {
  // a 5-tile wall (rows 9..13) of ice on its left face (col 15) glued to rock (cols 16..20); the pickaxe lies at col 10
  const rows = (() => {
    const r = hall(40, 16);
    for (let y = 9; y <= 13; y++) r[y] = r[y]!.slice(0, 15) + 'I' + '#'.repeat(5) + r[y]!.slice(21);
    r[FLOOR] = r[FLOOR]!.slice(0, 10) + 'p' + r[FLOOR]!.slice(11);
    return r;
  })();
  const mk = (o: { campaign?: boolean; mode?: 'chain' | 'free' } = {}) => {
    const w = world(level(rows), { mode: o.mode ?? 'free', ...(o.campaign === false ? {} : camp()) });
    teleport(w, 0, 10, FLOOR);
    teleport(w, 1, 3, FLOOR);
    run(w, 2);
    return w;
  };
  const flush = (w: ReturnType<typeof mk>, slot: number) => {
    teleport(w, slot, 14, FLOOR);
    pl(w, slot).body.x = 15 * TILE - 34;
    pl(w, slot).body.facing = 1;
  }; // against the ice, facing it
  const up = (s: number) => (slot: number) => (slot === s ? inp({ up: true }) : undefined);
  it('walking over it takes it (once, with the cue), and it follows its holder', () => {
    const w = mk();
    expect(w.ent.pickaxes[0]!.heldBy).toBe(0);
    expect(pl(w, 0).camp.pick).toBe(0);
    const w2 = world(level(rows), { mode: 'free', ...camp() });
    teleport(w2, 0, 10, FLOOR);
    teleport(w2, 1, 3, FLOOR);
    expect(of(run(w2, 3), 'obst.pickaxe')).toEqual([{ player: 0, action: 'take' }]);
    teleport(w2, 0, 12, FLOOR);
    run(w2, 2);
    expect(w2.ent.pickaxes[0]!.x).toBeCloseTo(pl(w2, 0).body.x + 17, 3);
  });
  it('without the pickaxe, UP beside the ice does nothing', () => {
    const w = mk();
    flush(w, 1);
    const y0 = pl(w, 1).body.y;
    const ev = run(w, 120, up(1));
    expect(pl(w, 1).body.y).toBe(y0);
    expect(pl(w, 1).camp.pick).toBe(0);
    expect(of(ev, 'obst.pickaxe')).toEqual([]); // not even a "climb" cue
  });
  it('with it, UP beside the wall clings and climbs 1 tile per second; it rings "climb" once', () => {
    const w = mk();
    flush(w, 0);
    run(w, 3);
    const y0 = pl(w, 0).body.y;
    const ev = run(w, 60, up(0));
    expect(of(ev, 'obst.pickaxe')).toEqual([{ player: 0, action: 'climb' }]);
    expect(pl(w, 0).camp.pick).toBe(1);
    expect(y0 - pl(w, 0).body.y).toBeGreaterThan(44);
    expect(y0 - pl(w, 0).body.y).toBeLessThan(49); // 48 px/s
    expect(pl(w, 0).body.grounded).toBe(false);
  });
  it('it reaches the top in about 5 s, mantles over it ("top") and ends standing on the wall', () => {
    const w = mk();
    flush(w, 0);
    run(w, 3);
    const ev = run(w, 600, up(0));
    expect(of(ev, 'obst.pickaxe').map((e) => e.action)).toEqual(['climb', 'top']);
    expect(pl(w, 0).body.grounded).toBe(true);
    expect(pl(w, 0).body.y + PLAYER_H).toBeCloseTo(9 * TILE, 0); // feet on the top of the wall
    expect(pl(w, 0).camp.pick).toBe(0);
  });
  it('holding still on the wall hangs there; DOWN climbs back; the floor lets go', () => {
    const w = mk();
    flush(w, 0);
    run(w, 3);
    run(w, 100, up(0));
    const y = pl(w, 0).body.y;
    run(w, 60, (s) => (s === 0 ? inp({}) : undefined));
    expect(pl(w, 0).body.y).toBe(y);
    run(w, 300, (s) => (s === 0 ? inp({ down: true }) : undefined));
    expect(pl(w, 0).camp.pick).toBe(0);
    expect(pl(w, 0).body.grounded).toBe(true);
  });
  it('A jumps off the wall, away from it', () => {
    const w = mk();
    flush(w, 0);
    run(w, 3);
    run(w, 40, up(0));
    expect(pl(w, 0).camp.pick).toBe(1);
    run(w, 1, (s) => (s === 0 ? inp({ jump: true }) : undefined));
    expect(pl(w, 0).camp.pick).toBe(0);
    expect(pl(w, 0).body.vx).toBeLessThan(0);
    expect(pl(w, 0).body.vy).toBeLessThan(0);
  });
  it('a wall taller than the rope: the climber on top passes the pickaxe DOWN the rope (B, range = rope length) and the partner climbs it too, with the climber planted', () => {
    const w = mk({ mode: 'chain' });
    flush(w, 0);
    teleport(w, 1, 12, FLOOR);
    run(w, 3);
    run(w, 330, up(0));
    expect(pl(w, 0).body.grounded).toBe(true);
    expect(pl(w, 0).body.y + PLAYER_H).toBeCloseTo(9 * TILE, 0); // on top
    expect(pl(w, 1).body.grounded).toBe(false); // dangling on the rope, far below
    expect(pl(w, 1).body.y).toBeGreaterThan(pl(w, 0).body.y + 3 * TILE);
    expect(previewB(w, 0).action).toBe('pass'); // the partner is farther than a grab but within the rope
    const ev1 = run(w, 1, B(0));
    expect(of(ev1, 'obst.pickaxe')).toEqual([{ player: 0, action: 'pass' }]);
    expect(w.ent.pickaxes[0]!.heldBy).toBe(1);
    run(w, 1, B(0)); // hands empty now: B plants (anchor) so the partner is not dragged off the wall
    expect(pl(w, 0).planted).toBe(true);
    const ev2 = run(w, 600, (s) => (s === 1 ? inp({ up: true, move: 1 }) : undefined));
    expect(of(ev2, 'obst.pickaxe').map((e) => `${e.player}${e.action}`)).toEqual(['1climb', '1top']);
    expect(pl(w, 1).body.grounded).toBe(true);
    expect(pl(w, 1).body.y + PLAYER_H).toBeCloseTo(9 * TILE, 0); // both on top
    expect(pl(w, 1).mode).toBe('active');
  });
  it('a plain pass is limited to the grab range when nobody is tied (free mode): 62 px away B just plants', () => {
    const w = mk({ mode: 'free' });
    teleport(w, 1, 12, FLOOR);
    run(w, 2);
    expect(previewB(w, 0).action).toBe('plant');
  });
  it('B hands it to a teammate within reach (before lift and plant); out of reach B plants as usual', () => {
    const w = mk();
    teleport(w, 1, 11, FLOOR);
    run(w, 2);
    expect(previewB(w, 0).action).toBe('pass');
    const ev = run(w, 1, B(0));
    expect(of(ev, 'obst.pickaxe')).toEqual([{ player: 0, action: 'pass' }]);
    expect(w.ent.pickaxes[0]!.heldBy).toBe(1);
    expect(pl(w, 0).planted).toBe(false);
    expect(previewB(w, 1).action).toBe('pass'); // and it can go back
    teleport(w, 1, 30, FLOOR);
    run(w, 2);
    expect(previewB(w, 1).action).toBe('plant');
    run(w, 1, B(1));
    expect(pl(w, 1).planted).toBe(true);
    expect(w.ent.pickaxes[0]!.heldBy).toBe(1);
  });
  it('whoever dies loses it: it goes back where it was found', () => {
    const w = mk();
    expect(w.ent.pickaxes[0]!.heldBy).toBe(0);
    pl(w, 0).body.y = w.level.h * TILE + 300; // fell out of the level
    run(w, 3);
    expect(w.ent.pickaxes[0]!.heldBy).toBe(-1);
    expect(w.ent.pickaxes[0]!.x).toBe(w.ent.pickaxes[0]!.homeX);
  });
  it('quick match: the item is inert and the ice is just a wall', () => {
    const w = world(level(rows), { mode: 'free' });
    teleport(w, 0, 10, FLOOR);
    teleport(w, 1, 14, FLOOR);
    run(w, 5);
    expect(w.ent.pickaxes).toEqual([]);
    const y0 = pl(w, 1).body.y;
    run(w, 100, up(1));
    expect(pl(w, 1).body.y).toBe(y0);
  });
});

describe("throw niche: in a campaign the thrown player's rope stretches and the launch is faster, so a throw crosses what a jump or a tower cannot", () => {
  // floor to col 12, a GAP-wide pit (safe floor 3 rows down), floor again; the thrower stands at the edge with the partner beside it
  const cross = (gap: number, o: { campaign: boolean }) => {
    const rows = Array.from({ length: 20 }, (_, y) => {
      const cs = ('#' + '.'.repeat(48) + '#').split('');
      if (y >= 15) for (let x = 1; x <= 12; x++) cs[x] = '#';
      if (y >= 15) for (let x = 13 + gap; x < 49; x++) cs[x] = '#';
      if (y >= 18) cs.fill('#');
      if (y === 14) cs[2] = 'S';
      if (y === 14) cs[46] = 'G';
      return cs.join('');
    });
    const w = world(level(rows, { tether: 'chainOnly' }), {
      mode: 'chain',
      ...(o.campaign ? { campaign: { world: 'beach' as const } } : {}),
    });
    const [a, b] = [pl(w, 0), pl(w, 1)];
    a.body.x = 12 * TILE + 8;
    a.body.y = 15 * TILE - PLAYER_H;
    b.body.x = 11 * TILE + 4;
    b.body.y = 15 * TILE - PLAYER_H;
    for (const p of [a, b]) {
      p.body.grounded = true;
      p.body.air = 0;
      p.body.facing = 1;
    }
    run(w, 5);
    run(w, 1, B(0));
    run(w, 3); // lift
    let maxLen = 0,
      landed = false;
    const ev = run(w, 1, B(0), (e) => {
      void e;
    });
    maxLen = w.ropes[0]!.links[0]!.len;
    run(
      w,
      200,
      (s) => (s === 1 && b.body.grounded && !b.planted ? inp({ grab: true }) : undefined),
      () => {
        if (b.body.grounded && b.body.x > (13 + gap) * TILE - 20 && b.body.y + PLAYER_H <= 15 * TILE + 1) landed = true;
      },
    );
    return { landed, maxLen, ev, w };
  };
  it('campaign: a 5-tile pit (a jump carries 4 in the tied rope, a tower 3) is crossed by the throw', () => {
    const r = cross(5, { campaign: true });
    expect(r.landed).toBe(true);
  });
  it('quick match with the very same inputs: the old throw does not make it', () => {
    expect(cross(5, { campaign: false }).landed).toBe(false);
  });
  it('the rope of the thrown one is 1.5x longer at the throw and eases back to its own length within 1.2 s; the quick match rope is never longer', () => {
    const w = cross(3, { campaign: true }).w;
    const l = w.ropes[0]!.links[0]!;
    expect(l.len).toBeCloseTo(l.base, 6); // long settled
    const c = campaignParams(2, 'beach');
    expect(c.throwSlack).toBe(1.5);
    expect(c.throwSlackSec).toBe(1.2);
    const w2 = world(level(hall(40, 16)), { mode: 'chain', campaign: { world: 'beach' } });
    teleport(w2, 0, 10, FLOOR);
    teleport(w2, 1, 10, FLOOR);
    run(w2, 3);
    run(w2, 1, B(0));
    run(w2, 2);
    run(w2, 1, B(0));
    expect(w2.ropes[0]!.links[0]!.len).toBeGreaterThan(w2.ropes[0]!.links[0]!.base * 1.45);
    expect(w2.ropes[0]!.links[0]!.len).toBeLessThanOrEqual(w2.ropes[0]!.links[0]!.base * 1.5 + 1e-9);
    run(w2, steps(1.2) + 2);
    expect(w2.ropes[0]!.links[0]!.len).toBeCloseTo(w2.ropes[0]!.links[0]!.base, 6);
    const q = world(level(hall(40, 16)), { mode: 'chain' });
    teleport(q, 0, 10, FLOOR);
    teleport(q, 1, 10, FLOOR);
    run(q, 3);
    run(q, 1, B(0));
    run(q, 2);
    run(q, 1, B(0));
    expect(q.ropes[0]!.links[0]!.len).toBe(q.ropes[0]!.links[0]!.base);
  });
});

describe('determinism: a campaign world with every A5 dynamic on hashes the same twice', () => {
  it('same inputs, same hash', async () => {
    const { hashState } = await import('./world');
    const r = hall(40, 16);
    r[9] = r[9]!.slice(0, 8) + 'DDDD' + r[9]!.slice(12, 20) + 'EEEE' + r[9]!.slice(24);
    const mk = () =>
      world(
        level(r, {
          params: { D: { kind: 'balance', partner: 'E', travel: 3, speed: 1 }, E: { kind: 'balance', partner: 'D', travel: 3, speed: 1 } },
          enemies: [{ x: 28, y: FLOOR, range: 3 }],
          wind: { dir: -1, periodSec: 3, gustSec: 1 },
        }),
        { mode: 'free', ...camp() },
      );
    const a = mk(),
      b = mk();
    const f = (s: number, t: number) =>
      inp({ move: s === 0 ? 1 : -0.5, jump: t % 37 === s, grab: t % 90 === 11 && s === 1, up: t % 5 === 0 });
    for (let i = 0; i < 600; i++) {
      step(a, [f(0, i), f(1, i)]);
      step(b, [f(0, i), f(1, i)]);
    }
    expect(hashState(a)).toBe(hashState(b));
  });
});
