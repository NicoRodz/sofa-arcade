// Campaign dynamics 7-8 (plan §4, phase A5) in the real sim: ice and wind. Each one has its quick-match twin that must NOT show it (the layer is opt-in).

import { describe, expect, it } from 'vitest';
import { hall, inp, level, names, of, pl, run, teleport, world } from './testkit/testkit';
import { snapshot } from './world';

const camp = (n?: number) => ({ campaign: { world: 'forest' as const, n } });
const B = (s: number) => (slot: number) => (slot === s ? inp({ grab: true }) : undefined);
const FLOOR = 13; // standing row of hall(40, 16)

describe('dynamic 7: ice (friction x0.15 on I tiles; an anchor planted on ice slides)', () => {
  // the first half of the floor is rock and the second half ice: row 14 = the floor top
  const floor = (a: string, b: string) => {
    const r = hall(60, 16);
    r[14] = '#' + a.repeat(29) + b.repeat(30);
    return r;
  };
  const ICE = floor('#', 'I'),
    ROCK = floor('#', '#');
  // runs 40 steps to the right from `col`, lets go and measures how far the body glides until it stops
  const glide = (rows: string[], col: number, o: { campaign?: boolean } = {}) => {
    const w = world(level(rows), { mode: 'free', ...(o.campaign === false ? {} : camp()) });
    teleport(w, 1, 2, FLOOR);
    teleport(w, 0, col, FLOOR);
    run(w, 5);
    const vx10: number[] = [];
    run(
      w,
      40,
      (s) => (s === 0 ? inp({ move: 1 }) : undefined),
      () => {
        if (vx10.length < 10) vx10.push(pl(w, 0).body.vx);
      },
    );
    const x0 = pl(w, 0).body.x,
      vTop = pl(w, 0).body.vx;
    let stopAt = 0;
    run(w, 120, undefined, () => {
      if (Math.abs(pl(w, 0).body.vx) > 1) stopAt = pl(w, 0).body.x - x0;
    });
    return { vx: vx10[9]!, vTop, glide: stopAt, w };
  };
  it('on ice it accelerates slowly (10 steps in: under 40 % of the speed rock gives) and glides >4x farther after letting go', () => {
    const ice = glide(ICE, 35),
      rock = glide(ROCK, 35);
    expect(rock.vx).toBeGreaterThan(300);
    expect(ice.vx).toBeLessThan(0.4 * rock.vx);
    expect(ice.glide).toBeGreaterThan(4 * rock.glide);
    expect(ice.glide).toBeGreaterThan(40);
  });
  it('quick match: ice grips like rock (no friction parameter outside a campaign)', () => {
    const ice = glide(ICE, 35, { campaign: false }),
      rock = glide(ROCK, 35, { campaign: false });
    expect(ice.vx).toBeCloseTo(rock.vx, 3);
    expect(ice.glide).toBeCloseTo(rock.glide, 3);
  });
  it('stepping from rock onto ice rings obst.ice once; walking on rock never does', () => {
    const w = world(level(ICE), { mode: 'free', ...camp() });
    teleport(w, 1, 2, FLOOR);
    teleport(w, 0, 27, FLOOR);
    const ev = run(w, 90, (s) => (s === 0 ? inp({ move: 1 }) : undefined));
    expect(of(ev, 'obst.ice')).toEqual([{ player: 0 }]);
    const r = world(level(ROCK), { mode: 'free', ...camp() });
    teleport(r, 1, 2, FLOOR);
    teleport(r, 0, 27, FLOOR);
    expect(
      of(
        run(r, 90, (s) => (s === 0 ? inp({ move: 1 }) : undefined)),
        'obst.ice',
      ),
    ).toEqual([]);
  });
  // plateau (cols 1..14, top at row 8): the planted one stands on its edge, the other dangles from the rope (same set-up as the anchor tests)
  const plateau = (top: string) =>
    Array.from({ length: 16 }, (_, y) => {
      const cs = ('#' + '.'.repeat(28) + '#').split('');
      if (y >= 8) for (let x = 1; x <= 14; x++) cs[x] = y === 8 ? top : '#';
      if (y === 15) cs.fill('#');
      if (y === 7) cs[2] = 'S';
      if (y === 14) cs[27] = 'G';
      return cs.join('');
    });
  const hang = (top: string) => {
    const w = world(level(plateau(top)), { mode: 'chain', ...camp() });
    teleport(w, 0, 13, 7);
    teleport(w, 1, 16, 5);
    run(w, 5);
    run(w, 1, B(0));
    const x0 = pl(w, 0).body.x;
    run(w, 90);
    return { dx: pl(w, 0).body.x - x0, w };
  };
  it('a planted anchor on ice slides towards the edge like one over its limit (0.5 tile/s); on rock it does not move', () => {
    const rock = hang('#'),
      ice = hang('I');
    expect(Math.abs(rock.dx)).toBeLessThan(0.01);
    expect(ice.dx).toBeGreaterThan(15); // 0.5 tile/s x 1.5 s = 36 px, minus the braking
    expect(ice.dx).toBeLessThan(40);
    expect(pl(ice.w, 0).planted).toBe(true);
  });
});

describe('dynamic 8: wind (a gust announced 1 s ahead pushes whoever is in the air)', () => {
  const wind = { dir: 1 as const, periodSec: 4, gustSec: 1 }; // calm 0-2 s, warn 2-3 s, gust 3-4 s
  const mk = (extra: object = {}, o: { campaign?: boolean; slots?: number[]; n?: number } = {}) => {
    const w = world(level(hall(40, 16), { wind, ...extra }), {
      mode: 'free',
      slots: o.slots ?? [0, 1],
      ...(o.campaign === false ? {} : camp(o.n)),
    });
    teleport(w, 0, 3, FLOOR);
    teleport(w, 1, 36, FLOOR);
    return w;
  };
  it('the phases ring at 2.0 s (warn), 3.0 s (gust) and 4.0 s (calm), every period', () => {
    const w = mk();
    const seen: [number, string][] = [];
    run(w, 250, undefined, (ev) => {
      for (const e of of(ev, 'obst.wind')) seen.push([w.tick, e.phase]);
    });
    expect(seen).toEqual([
      [120, 'warn'],
      [180, 'gust'],
      [240, 'calm'],
    ]);
    expect(of(run(w, 250, undefined), 'obst.wind').map((e) => e.phase)).toEqual(['warn', 'gust', 'calm']); // the next period (ticks 240..480)
  });
  const drift = (w: ReturnType<typeof mk>, slot: number, from: number) => {
    run(w, from - w.tick - 1);
    teleport(w, slot, 10, 3); // up in the air at the start of the gust
    const x0 = pl(w, slot).body.x;
    run(w, 30);
    return pl(w, slot).body.x - x0;
  };
  it('in the air during the gust: 140 px/s to the side of `dir` (35 px in 30 steps... 70 for the half second); the same fall in the calm drifts nothing', () => {
    const calm = drift(mk(), 0, 20); // ticks 20..50: calm
    const gust = drift(mk(), 0, 181); // ticks 181..211: gust
    expect(Math.abs(calm)).toBeLessThan(0.01);
    expect(gust).toBeGreaterThan(65);
    expect(gust).toBeLessThan(75); // 30 steps x 140 / 60 = 70
  });
  it('on the ground nothing moves during the gust', () => {
    const w = mk();
    run(w, 179);
    teleport(w, 0, 10, FLOOR);
    run(w, 2);
    const x0 = pl(w, 0).body.x;
    run(w, 40);
    expect(pl(w, 0).body.x).toBeCloseTo(x0, 3);
  });
  it('a zone limits it: outside the rectangle the air is still', () => {
    const inside = drift(mk({ wind: { ...wind, zone: { x: 5, y: 0, w: 10, h: 14 } } }), 0, 181);
    const outside = drift(mk({ wind: { ...wind, zone: { x: 25, y: 0, w: 10, h: 14 } } }), 0, 181);
    expect(inside).toBeGreaterThan(65);
    expect(Math.abs(outside)).toBeLessThan(0.01);
  });
  it('N>=3: the force is x0.8 (plan §4)', () => {
    const n2 = drift(mk(), 0, 181);
    const n3 = drift(mk({}, { slots: [0, 1, 2], n: 3 }), 0, 181);
    expect(n3 / n2).toBeCloseTo(0.8, 2);
  });
  it('quick match: the wind is not part of the world (no event, no push)', () => {
    const w = mk({}, { campaign: false });
    const seen = names(run(w, 250));
    expect(seen.filter((n) => n === 'obst.wind')).toEqual([]);
    expect(Math.abs(drift(mk({}, { campaign: false }), 0, 181))).toBeLessThan(0.01);
    expect(snapshot(w).wind).toBeNull();
  });
  it('the snapshot says which phase it is (the renderer draws the streaks from it)', () => {
    const w = mk();
    run(w, 130);
    expect(snapshot(w).wind).toEqual({ phase: 'warn', dir: 1, zone: null });
  });
});
