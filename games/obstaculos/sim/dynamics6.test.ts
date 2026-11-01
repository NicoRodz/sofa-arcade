// Campaign dynamics 10-12 (plan §4, phase A6) in the real sim: lantern and crystals, elastic ring, sinkers and geyser. Each one has its quick-match twin that must NOT show it
// (the layer is opt-in) and the numbers that params(2) freezes (campaign.test.ts).
import { describe, expect, it } from 'vitest';
import { DT, JUMP_V0, PLAYER_H, ROPE_LEN, TILE } from '../constants';
import { T } from '../legend';
import { draw, hall, inp, level, names, obj, of, pl, run, teleport, tile, vline, world } from './testkit/testkit';
import { previewB, snapshot } from './world';

const camp = (n?: number) => ({ campaign: { world: 'mine' as const, n } });
const B = (s: number) => (slot: number) => (slot === s ? inp({ grab: true }) : undefined);
const FLOOR = 13; // standing row of hall(40, 16)
const steps = (sec: number) => Math.round(sec / DT);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('dynamic 10: lantern and crystals (a crystal is solid only while the lantern lights it)', () => {
  // lantern lying at column 6; a wall of 4 crystals at column 20 (rows 10..13: from the floor to 3 tiles above it)
  const rows = draw(hall(40, 16), [6, FLOOR, 'l'], ...vline(20, 10, FLOOR, 'Y'));
  const mk = (o: { campaign?: boolean; slots?: number[] } = {}) => {
    const w = world(level(rows), { mode: 'free', slots: o.slots ?? [0, 1], ...(o.campaign === false ? {} : camp()) });
    teleport(w, 0, 3, FLOOR);
    teleport(w, 1, 4, FLOOR);
    return w;
  };
  const crystals = (w: ReturnType<typeof mk>) => w.ent.crystals.map((c) => tile(w, c.x, c.y));
  it('a level with a lantern is dark, the crystals start dark (T.Crystal, not solid) and the lantern lights a circle of 4 tiles', () => {
    const w = mk();
    expect(w.ent.lanterns).toHaveLength(1);
    expect(w.ent.crystals).toHaveLength(4);
    run(w, 3);
    expect(crystals(w)).toEqual([T.Crystal, T.Crystal, T.Crystal, T.Crystal]);
    const s = snapshot(w);
    expect(s.dark!.radius).toBe(4 * TILE);
    expect(s.dark!.lights).toEqual([{ x: 6.5 * TILE, y: 13.5 * TILE }]); // on the floor where it was found
    expect(s.lanterns).toEqual([{ x: 6.5 * TILE, y: 13.5 * TILE, heldBy: -1 }]);
  });
  it('dark crystals are air: a player runs through the wall', () => {
    const w = mk();
    teleport(w, 0, 18, FLOOR);
    run(w, 90, (s) => (s === 0 ? inp({ move: 1 }) : undefined));
    expect(pl(w, 0).body.x).toBeGreaterThan(22 * TILE);
  });
  it('touching it takes it (obst.lantern take); carried to 2 tiles of the wall the crystals turn solid at once (one "light" event) and stop whoever runs into them', () => {
    const w = mk();
    teleport(w, 0, 6, FLOOR);
    const ev = run(w, 2);
    expect(of(ev, 'obst.lantern')).toEqual([{ player: 0, action: 'take' }]);
    expect(w.ent.lanterns[0]!.heldBy).toBe(0);
    teleport(w, 0, 18, FLOOR);
    const ev2 = run(w, 2);
    expect(crystals(w)).toEqual([T.CrystalLit, T.CrystalLit, T.CrystalLit, T.CrystalLit]);
    expect(of(ev2, 'obst.lantern')).toEqual([{ player: 0, action: 'light' }]);
    teleport(w, 1, 15, FLOOR);
    run(w, 90, (s) => (s === 1 ? inp({ move: 1 }) : undefined));
    expect(pl(w, 1).body.x).toBeLessThan(20 * TILE - 30); // stopped by the lit wall
  });
  it('the circle is 4 tiles of radius, centre to centre: the crystal 3 tiles away is lit, the ones farther are not, and the top of the wall (3 tiles up) needs the holder closer', () => {
    const w = mk();
    teleport(w, 0, 6, FLOOR);
    run(w, 2);
    teleport(w, 0, 17, FLOOR);
    run(w, 2); // 3 tiles from column 20 on the floor: the bottom crystal is lit, the top one (3 up and 3 across = 4.2 tiles) is not
    expect(crystals(w)).toEqual([T.Crystal, T.CrystalLit, T.CrystalLit, T.CrystalLit]);
    teleport(w, 0, 15, FLOOR);
    run(w, 2); // 5 tiles away: nothing
    expect(crystals(w)).toEqual([T.Crystal, T.Crystal, T.Crystal, T.Crystal]);
  });
  it('walking away with the lantern puts the light out: "dim" rings once and whoever stood on a lit crystal falls', () => {
    const w = mk();
    teleport(w, 0, 6, FLOOR);
    run(w, 2);
    teleport(w, 0, 18, FLOOR);
    run(w, 2);
    teleport(w, 1, 20, 8); // above the wall (rows 10..13 are crystals): it lands on the lit top
    run(w, 40);
    expect(pl(w, 1).body.y + PLAYER_H).toBeCloseTo(10 * TILE, 0);
    teleport(w, 0, 8, FLOOR);
    const ev = run(w, 40);
    expect(of(ev, 'obst.lantern')).toEqual([{ player: -1, action: 'dim' }]);
    expect(pl(w, 1).body.y + PLAYER_H).toBeCloseTo((FLOOR + 1) * TILE, 0); // fell to the floor
  });
  it('a crystal never turns solid around a body: it waits dark until the cell is free', () => {
    const w = mk();
    teleport(w, 0, 6, FLOOR);
    run(w, 2);
    teleport(w, 1, 20, FLOOR); // standing inside the lowest crystal
    teleport(w, 0, 18, FLOOR);
    run(w, 3);
    expect(tile(w, 20, FLOOR)).toBe(T.Crystal); // player 1 stands in it
    expect(tile(w, 20, 11)).toBe(T.CrystalLit); // the ones nobody stands in are solid
    teleport(w, 1, 24, FLOOR);
    run(w, 2);
    expect(tile(w, 20, FLOOR)).toBe(T.CrystalLit);
  });
  it('B hands it over to a teammate in reach (preview says "pass"), obst.lantern pass rings and the light follows the new holder', () => {
    const w = mk();
    teleport(w, 0, 6, FLOOR);
    run(w, 2);
    teleport(w, 1, 7, FLOOR);
    expect(previewB(w, 0).action).toBe('pass');
    const ev = run(w, 1, B(0));
    expect(of(ev, 'obst.lantern')).toEqual([{ player: 0, action: 'pass' }]);
    expect(w.ent.lanterns[0]!.heldBy).toBe(1);
    expect(snapshot(w).dark!.lights[0]!.x).toBeCloseTo(pl(w, 1).body.x + 17, 0);
  });
  it('whoever dies drops it where it was found and the crystals go dark', () => {
    const w = mk();
    teleport(w, 0, 6, FLOOR);
    run(w, 2);
    teleport(w, 0, 18, FLOOR);
    run(w, 2);
    pl(w, 0).body.y = w.level.h * TILE + 300; // out of the grid: falls to its death
    run(w, 4);
    expect(w.ent.lanterns[0]!.heldBy).toBe(-1);
    expect(w.ent.lanterns[0]!.x).toBe(6.5 * TILE);
    expect(crystals(w)).toEqual([T.Crystal, T.Crystal, T.Crystal, T.Crystal]);
  });
  it('quick match: no lanterns, no dark, the crystals are plain air', () => {
    const w = mk({ campaign: false });
    expect(w.ent.lanterns).toEqual([]);
    expect(w.ent.crystals).toEqual([]);
    expect(snapshot(w).dark).toBeNull();
    teleport(w, 0, 6, FLOOR);
    run(w, 5);
    expect(names(run(w, 30))).not.toContain('obst.lantern');
    expect(tile(w, 20, 10)).toBe(T.Empty);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('dynamic 11: elastic ring (the rope that hangs from a "u" ring stretches up to 1.6x and bounces)', () => {
  const rows = draw(hall(40, 16), [10, 5, 'u']); // a ring in open air, 9 tiles above the floor
  const ROPE = ROPE_LEN * 1.2; // the campaign's rope (201.6 px)
  const mk = (o: { campaign?: boolean; marker?: string } = {}) => {
    const lv = o.marker ? draw(hall(40, 16), [10, 5, o.marker]) : rows;
    const w = world(level(lv), { mode: 'chain', ...(o.campaign === false ? {} : camp()) });
    teleport(w, 0, 10, 5); // at the ring
    teleport(w, 1, 10, 9); // 4 tiles under it, in the air: it will fall
    run(w, 1, B(0)); // anchor
    return w;
  };
  const dist = (w: ReturnType<typeof mk>) => Math.hypot(pl(w, 0).body.x - pl(w, 1).body.x, pl(w, 0).body.y - pl(w, 1).body.y);
  // fall: max stretch and the step it happens
  const fall = (w: ReturnType<typeof mk>, n = 240) => {
    let max = 0,
      maxAt = 0,
      vyUp = 0;
    const ev = run(w, n, undefined, () => {
      const d = dist(w);
      if (d > max) {
        max = d;
        maxAt = w.tick;
      }
      if (w.tick > maxAt) vyUp = Math.min(vyUp, pl(w, 1).body.vy);
    });
    return { max, maxAt, vyUp, ev };
  };
  it('anchored to it, the partner falls past the rope length (up to 1.6x), bounces back up (upward speed after the stretch) and obst.bungee rings with its stretch', () => {
    const w = mk();
    expect(pl(w, 0).holding).toEqual({ kind: 'ring', id: 0 });
    const f = fall(w);
    expect(f.max).toBeGreaterThan(1.3 * ROPE);
    expect(f.max).toBeLessThan(1.6 * ROPE + 6); // the hard stop
    expect(f.vyUp).toBeLessThan(-100); // pulled back up after the stretch
    const b = of(f.ev, 'obst.bungee');
    expect(b.length).toBeGreaterThanOrEqual(1);
    expect(b[0]!.player).toBe(1);
    expect(b[0]!.stretch).toBeGreaterThanOrEqual(1.25);
    expect(names(f.ev)).not.toContain('obst.ropeStrain'); // a spring does not complain like a rope
  });
  it('the bounce dies out: after a few seconds it hangs steady under the ring, stretched about 0.2 of the rope, and it is never sent to a bubble', () => {
    const w = mk();
    run(w, 600);
    const d = dist(w);
    expect(d).toBeGreaterThan(ROPE * 1.05);
    expect(d).toBeLessThan(ROPE * 1.3);
    const lo = (() => {
      let m = Infinity,
        M = 0;
      run(w, 90, undefined, () => {
        const x = dist(w);
        m = Math.min(m, x);
        M = Math.max(M, x);
      });
      return M - m;
    })();
    expect(lo).toBeLessThan(0.02 * ROPE); // settled (a plain asymmetric-gravity limit cycle would still swing 15+ px)
    expect(pl(w, 1).mode).toBe('active');
  });
  it('the same fall on a plain ring ("o") stops at the rope length with no bounce and no bungee event; quick match treats "u" as a plain ring too', () => {
    const plain = mk({ marker: 'o' });
    const f = fall(plain);
    expect(f.max).toBeLessThan(1.08 * ROPE);
    expect(f.ev.filter((e) => e.name === 'obst.bungee')).toEqual([]);
    const q = mk({ campaign: false });
    const g = fall(q);
    expect(g.max).toBeLessThan(1.08 * ROPE * (ROPE_LEN / ROPE) + 20); // the legacy rope is 3.5 tiles
    expect(g.ev.filter((e) => e.name === 'obst.bungee')).toEqual([]);
    expect(snapshot(q).rings[0]!.elastic).toBe(false);
    expect(snapshot(mk()).rings[0]!.elastic).toBe(true);
  });
  it('letting go of the ring (A) makes the link a plain rope again', () => {
    const w = mk();
    run(w, 120);
    expect(snapshot(w).ropes[0]!.links[0]!.elastic).toBe(true);
    run(w, 1, (s) => (s === 0 ? inp({ jump: true }) : undefined));
    run(w, 2);
    expect(snapshot(w).ropes[0]!.links[0]!.elastic).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('dynamic 12a: sinkers (a rock sinks 0.5 tile/s PER CHARACTER and floats back up when it is empty)', () => {
  const rows = draw(hall(40, 16), [8, 9, 'DDDD']);
  const params = { D: { kind: 'sinker' as const, travel: 3 } };
  const mk = (o: { campaign?: boolean; slots?: number[]; n?: number } = {}) => {
    const w = world(level(rows, { params }), { mode: 'free', slots: o.slots ?? [0, 1], ...(o.campaign === false ? {} : camp(o.n)) });
    for (const p of w.players) teleport(w, p.slot, 3 + p.slot, FLOOR);
    return w;
  };
  it('one character on it: 0.5 tile/s (24 px per second), the rider goes down with it and obst.sinker rings once with load 1', () => {
    const w = mk();
    teleport(w, 0, 9, 8);
    const y0 = pl(w, 0).body.y;
    const ev = run(w, 60);
    expect(obj(w, 'D').oy).toBeGreaterThan(21);
    expect(obj(w, 'D').oy).toBeLessThan(25.5); // 24 px minus the step it takes to load
    expect(pl(w, 0).body.y - y0).toBeCloseTo(obj(w, 'D').oy, 0);
    expect(of(ev, 'obst.sinker')).toEqual([{ id: 'D', load: 1 }]);
  });
  it('two characters: twice as fast (the sinking is per character)', () => {
    const w = mk();
    teleport(w, 0, 9, 8);
    teleport(w, 1, 10, 8);
    run(w, 60);
    expect(obj(w, 'D').oy).toBeGreaterThan(44);
    expect(obj(w, 'D').oy).toBeLessThan(50);
  });
  it('it stops at its travel (3 tiles) and rings only once', () => {
    const w = mk();
    teleport(w, 0, 9, 8);
    const ev = run(w, 60 * 7);
    expect(obj(w, 'D').oy).toBeCloseTo(3 * TILE, 6);
    expect(of(ev, 'obst.sinker')).toHaveLength(1);
  });
  it('empty, it floats back up at 0.5 tile/s down to its place', () => {
    const w = mk();
    teleport(w, 0, 9, 8);
    run(w, 120);
    const low = obj(w, 'D').oy;
    teleport(w, 0, 3, FLOOR);
    run(w, 60);
    expect(Math.abs(obj(w, 'D').oy - (low - 24))).toBeLessThan(1.5); // 24 px up (the step it takes to notice the empty rock is 0.4 px)
    run(w, 300);
    expect(obj(w, 'D').oy).toBe(0);
  });
  it('quick match: the rock is a still platform (it carries, it does not sink, no event)', () => {
    const w = mk({ campaign: false });
    teleport(w, 0, 9, 8);
    const y0 = pl(w, 0).body.y;
    const ev = run(w, 120);
    expect(obj(w, 'D').oy).toBe(0);
    expect(Math.abs(pl(w, 0).body.y - y0)).toBeLessThan(1);
    expect(names(ev)).not.toContain('obst.sinker');
  });
});

describe('dynamic 12b: geyser (a timed spring: 1 s of bubbling, then 0.5 s of eruption launches whoever is in the vent)', () => {
  const rows = draw(hall(40, 16), [20, FLOOR, 'E']);
  const params = { E: { kind: 'geyser' as const, periodSec: 4, activeSec: 0.5 } };
  const mk = (o: { campaign?: boolean } = {}) => {
    const w = world(level(rows, { params }), { mode: 'free', ...(o.campaign === false ? {} : camp()) });
    teleport(w, 0, 3, FLOOR);
    teleport(w, 1, 5, FLOOR);
    return w;
  };
  const phases = (w: ReturnType<typeof mk>, n: number) => {
    const out: { tick: number; phase: string }[] = [];
    run(w, n, undefined, (ev) => {
      for (const e of ev) if (e.name === 'obst.geyser') out.push({ tick: w.tick, phase: e.data.phase });
    });
    return out;
  };
  it('every 4 s: "warn" at 2.5 s, "gush" at 3.5 s (the last 0.5 s of the period), "calm" when the period turns', () => {
    const w = mk();
    expect(phases(w, 480)).toEqual([
      { tick: 150, phase: 'warn' },
      { tick: 210, phase: 'gush' },
      { tick: 240, phase: 'calm' },
      { tick: 390, phase: 'warn' },
      { tick: 450, phase: 'gush' },
      { tick: 480, phase: 'calm' },
    ]);
  });
  it('whoever stands in the vent when it erupts is launched at 1.65 x the jump speed, far above a normal jump; the other one, outside, stays', () => {
    const w = mk();
    teleport(w, 0, 20, FLOOR);
    run(w, 209);
    expect(pl(w, 0).body.grounded).toBe(true);
    const feet0 = pl(w, 0).body.y + PLAYER_H;
    let vy = 0,
      top = feet0;
    run(w, 90, undefined, () => {
      vy = Math.min(vy, pl(w, 0).body.vy);
      top = Math.min(top, pl(w, 0).body.y + PLAYER_H);
    });
    expect(vy).toBeLessThan(-JUMP_V0 * 1.6);
    expect(feet0 - top).toBeGreaterThan(300); // a normal jump is 173 px; 1.65x the speed is 2.7x the height
    expect(pl(w, 1).body.y + PLAYER_H).toBeCloseTo(feet0, 0);
  });
  it('being in the vent while it is calm or only bubbling does nothing', () => {
    const w = mk();
    teleport(w, 0, 20, FLOOR);
    let top = Infinity;
    const f0 = pl(w, 0).body.y;
    run(w, 205, undefined, () => {
      top = Math.min(top, pl(w, 0).body.y);
    });
    expect(f0 - top).toBeLessThan(1);
  });
  it('one launch per eruption: the body is still inside the vent for the first steps of the climb and must not be hurled again (the apex stays at ~9.8 tiles: 1.65 x v0, not a held jet)', () => {
    const w = mk();
    teleport(w, 0, 20, FLOOR);
    run(w, 209);
    const f0 = pl(w, 0).body.y + PLAYER_H;
    let top = f0;
    run(w, 120, undefined, () => {
      top = Math.min(top, pl(w, 0).body.y + PLAYER_H);
    });
    expect(f0 - top).toBeGreaterThan(9.5 * TILE);
    expect(f0 - top).toBeLessThan(10.1 * TILE);
  });
  it('quick match: the vent is air, nobody is launched, no event', () => {
    const w = mk({ campaign: false });
    teleport(w, 0, 20, FLOOR);
    let top = Infinity;
    const f0 = pl(w, 0).body.y;
    const ev = run(w, 480, undefined, () => {
      top = Math.min(top, pl(w, 0).body.y);
    });
    expect(f0 - top).toBeLessThan(1);
    expect(names(ev)).not.toContain('obst.geyser');
  });
});
