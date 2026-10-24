import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../rng';
import { ROPE_LEN, TILE } from '../constants';
import { LEVEL_01, LEVEL_04, LEVEL_08 } from '../levels';
import type { PlayerStep } from './input';
import { T } from '../legend';
import { draw, hall, inp, level, names, pl, run, teleport, tile, world } from './testkit';
import { createWorld, hashState, setConnected, snapshot, step } from './world';

// Scripted "phones": each slot holds a direction for a while, jumps and grabs at random, from one seed.
function bots(seed: number) {
  const rng = mulberry32(seed);
  const dir = Array<number>(8).fill(0), until = Array<number>(8).fill(0);
  return (s: number, t: number): PlayerStep => {
    if (t >= until[s]!) { dir[s] = [-1, 0, 1, 1][Math.floor(rng() * 4)]!; until[s] = t + 15 + Math.floor(rng() * 70); }
    return inp({ move: dir[s]!, jump: rng() < 0.04, down: rng() < 0.03, up: rng() < 0.05, grab: rng() < 0.01 });
  };
}
const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7];

describe('determinism (plan §17)', () => {
  const play = (seed: number, steps = 3600) => { const w = createWorld({ level: LEVEL_01, mode: 'chain', difficulty: 'easy', slots: SLOTS }); run(w, steps, bots(seed)); return w; };
  it('the same inputs give the same hash after 3600 steps with 8 players, and the world is alive (it moved, ropes taut)', () => {
    const a = play(11), b = play(11);
    expect(hashState(a)).toBe(hashState(b));
    expect(a.tick).toBe(3600);
    expect(a.status).toBe('playing');
    expect(a.players.some((p) => p.body.x > 8 * TILE)).toBe(true);
  });
  it('a different seed, a different mode or a different difficulty changes the hash', () => {
    const h = hashState(play(11));
    expect(hashState(play(12))).not.toBe(h);
    expect(hashState(createWorld({ level: LEVEL_01, mode: 'free', difficulty: 'normal', slots: SLOTS }))).not.toBe(hashState(createWorld({ level: LEVEL_01, mode: 'chain', difficulty: 'normal', slots: SLOTS })));
    const free = createWorld({ level: LEVEL_01, mode: 'free', difficulty: 'easy', slots: SLOTS });
    run(free, 3600, bots(11));
    expect(hashState(free)).not.toBe(h);
  });
  it('half a second of different input for one phone early in the run changes the hash 10 s later (the sim is not saturated)', () => {
    const go = (perturb: boolean) => {
      const f = bots(11);
      const w = createWorld({ level: LEVEL_01, mode: 'chain', difficulty: 'easy', slots: SLOTS });
      run(w, 600, (s, t) => (perturb && s === 3 && t >= 100 && t < 130 ? { ...f(s, t), jump: t % 2 === 0, move: 1 } : f(s, t)));
      return hashState(w);
    };
    expect(go(true)).not.toBe(go(false));
    expect(go(false)).toBe(go(false));
  });
  it('the hash sees every kind of state: a plate load, a box, a rope link, a crumble timer each move it', () => {
    const lvl = level(draw(hall(), [10, 11, 'a'], [14, 11, 'x'], [20, 9, '!'], [30, 11, 'k']), { params: { a: { kind: 'plate', weight: 1, opens: 'B', latch: false }, B: { kind: 'gate' } } });
    const mk = () => world(draw0(lvl), { mode: 'chain' });
    const base = hashState(mk());
    const w1 = mk(); w1.ent.boxes[0]!.x += 1; expect(hashState(w1)).not.toBe(base);
    const w2 = mk(); w2.ent.crumbles[0]!.t = 5; expect(hashState(w2)).not.toBe(base);
    const w3 = mk(); w3.ropes[0]!.links[0]!.valve = 3; expect(hashState(w3)).not.toBe(base);
    const w4 = mk(); w4.ent.activators[0]!.latched = true; expect(hashState(w4)).not.toBe(base);
    const w5 = mk(); w5.ent.keys[0]!.heldBy = 1; expect(hashState(w5)).not.toBe(base);
    const w6 = mk(); w6.players[0]!.planted = true; expect(hashState(w6)).not.toBe(base);
  });
});
// the level of the hash test has a gate letter B without cells: add it so that parse is clean
const draw0 = (l: ReturnType<typeof level>) => ({ ...l, rows: draw(l.rows, [40, 8, 'B']) });

describe('stability with 8 players', () => {
  it('level 1, chain, 3600 steps of random phones: nothing is NaN, nobody leaves the level, links stay within 1.05 L except for rare transients', () => {
    const w = createWorld({ level: LEVEL_01, mode: 'chain', difficulty: 'easy', slots: SLOTS });
    let over = 0, links = 0, maxD = 0;
    run(w, 3600, bots(5), () => {
      for (const p of w.players) {
        expect(Number.isFinite(p.body.x + p.body.y + p.body.vx + p.body.vy)).toBe(true);
        expect(p.body.x).toBeGreaterThan(-1); expect(p.body.x).toBeLessThan(60 * TILE);
      }
      for (const r of w.ropes) for (const l of r.links) {
        if (!l.active) continue;
        const A = pl(w, l.a).body, B = pl(w, l.b).body;
        const d = Math.hypot(A.x - B.x, A.y - B.y) / l.len;
        links++; if (d > 1.05) over++; maxD = Math.max(maxD, d);
      }
    });
    expect(w.status).toBe('playing');
    expect(links).toBeGreaterThan(15000);
    expect(over / links).toBeLessThan(0.002); // walls and respawns can stretch a link for a few steps: measured 5 in 20551
    expect(maxD).toBeLessThan(1.5);
  });
  it('level 4 with 6 phones in Encadenados (rings, a cliff): 2 cordadas of 3', () => {
    const w = createWorld({ level: LEVEL_04, mode: 'chain', difficulty: 'easy', slots: [0, 1, 2, 3, 4, 5] });
    expect(w.ropes.map((r) => r.members)).toEqual([[0, 1, 2], [3, 4, 5]]);
    expect(w.ent.rings).toHaveLength(2);
    run(w, 1800, bots(9));
    expect(w.tick).toBe(1800);
  });
  it('level 8 forces Libres whatever the lobby says, and 4 players solve the plates: 2 on a and 2 on b open the gate', () => {
    const w = createWorld({ level: LEVEL_08, mode: 'chain', difficulty: 'normal', slots: [0, 1, 2, 3] });
    expect(w.mode).toBe('free');
    expect(w.ropes).toHaveLength(0);
    expect(w.ent.objectives.map((o) => `${o.letter}:${o.kind}`)).toEqual(['A:gate', 'D:balance', 'E:balance', 'F:ladder']);
    expect(w.ent.activators.map((a) => `${a.letter}:${a.kind}`)).toEqual(['a:plate', 'b:plate', 'c:plate']);
    expect(tile(w, 36, 10)).toBe(T.Object); // the ladder F is not there yet
    teleport(w, 0, 16, 15); teleport(w, 1, 18, 15); teleport(w, 2, 23, 15); teleport(w, 3, 25, 15);
    run(w, 20);
    expect(w.ent.activators.map((a) => [a.required, a.load, a.pressed])).toEqual([[2, 2, true], [2, 2, true], [1, 0, false]]);
    expect(tile(w, 21, 14)).toBe(T.Object); // gate open
    teleport(w, 2, 40, 7); teleport(w, 3, 41, 7); // the pair on b leaves: a still holds the gate open (a OR b, plan §11 step 1)
    run(w, 20);
    expect(tile(w, 21, 14)).toBe(T.Object);
    teleport(w, 0, 5, 15); teleport(w, 1, 6, 15); // and now nobody is on a plate: it closes
    run(w, 20);
    expect(tile(w, 21, 14)).toBe(T.Door);
  });
  it('level 8 balance: the heavy group goes down on D, the light one up on E, then the plate c latches the ladder F', () => {
    const w = createWorld({ level: LEVEL_08, mode: 'free', difficulty: 'normal', slots: [0, 1, 2, 3] });
    teleport(w, 0, 28, 12); teleport(w, 1, 27, 12); teleport(w, 2, 33, 12); teleport(w, 3, 20, 3);
    run(w, 60);
    const D = w.ent.objectives.find((o) => o.letter === 'D')!, E = w.ent.objectives.find((o) => o.letter === 'E')!;
    expect([D.load, E.load]).toEqual([2, 1]);
    expect(D.oy).toBeGreaterThan(40);
    expect(E.oy).toBeCloseTo(-D.oy, 6);
    teleport(w, 3, 39, 7);
    run(w, 10);
    expect(w.ent.activators[2]!.latched).toBe(true);
    expect(tile(w, 36, 10)).toBe(T.Ladder);
  });
});

describe('connections', () => {
  it('a leaver drops out of the rope and plates; a joiner returns at the checkpoint with invulnerability and the rope hooks up', () => {
    const w = world(level(hall(80, 14)), { mode: 'chain', slots: [0, 1, 2] });
    teleport(w, 0, 10, 11); teleport(w, 1, 12, 11); teleport(w, 2, 14, 11);
    run(w, 5);
    setConnected(w, 1, false);
    expect(w.ropes[0]!.members).toEqual([0, 2]);
    expect(pl(w, 1).connected).toBe(false);
    const x = pl(w, 1).body.x;
    run(w, 30);
    expect(pl(w, 1).body.x).toBe(x); // frozen out of play
    setConnected(w, 1, true);
    expect(w.ropes[0]!.members).toEqual([0, 1, 2]);
    expect(pl(w, 1).invuln).toBeGreaterThan(0);
    expect(pl(w, 1).mode).toBe('active');
    setConnected(w, 5, true); // a slot that was never there
    expect(w.players.map((p) => p.slot)).toEqual([0, 1, 2, 5]);
    expect(w.ropes[0]!.members).toEqual([0, 1, 2, 5]);
  });
  it('the world step ignores inputs of absent slots and handles a sparse slot list', () => {
    const w = world(level(hall()), { slots: [6, 2] });
    expect(w.players.map((p) => p.slot)).toEqual([2, 6]);
    run(w, 10, () => inp({ move: 1 }));
    expect(step(w, [])).toEqual([]);
  });
});

describe('snapshot and lifecycle', () => {
  it('snapshot is plain data of the current state; tilesVersion bumps when a gate opens', () => {
    const lvl = level(draw(hall(), [10, 11, 'a'], [15, 8, 'A'], [15, 9, 'A'], [15, 10, 'A'], [15, 11, 'A']), { params: { a: { kind: 'plate', weight: 1, opens: 'A', latch: false }, A: { kind: 'gate' } } });
    const w = world(lvl, { mode: 'free' });
    teleport(w, 0, 10, 11); teleport(w, 1, 4, 11);
    const s0 = snapshot(w);
    expect(s0.players).toHaveLength(2);
    expect(s0.objects.find((o) => o.letter === 'A')).toMatchObject({ kind: 'gate', open: false, rect: { x: 15 * TILE, y: 8 * TILE, w: TILE, h: 4 * TILE } });
    run(w, 10);
    const s1 = snapshot(w);
    expect(s1.tilesVersion).toBeGreaterThan(s0.tilesVersion);
    expect(s1.objects.find((o) => o.letter === 'A')!.open).toBe(true);
    expect(s1.plates[0]).toMatchObject({ letter: 'a', pressed: true, load: 1, required: 1 });
    expect(s1.timeSec).toBeCloseTo(10 / 60, 6);
    expect(s0.timeSec).toBe(0); // the old snapshot did not change
    expect(JSON.parse(JSON.stringify({ ...s1, grid: undefined })).players[0].slot).toBe(0);
    expect(s1.players[0]!.b).toBeDefined();
  });
  it('snapshot exposes ropes, hazard, checkpoints and the goal zone for the scene', () => {
    const w = createWorld({ level: { ...LEVEL_01, hazard: { kind: 'risingLava', speed: 0.6 } }, mode: 'chain', slots: [0, 1, 2] });
    run(w, 60);
    const s = snapshot(w);
    expect(s.ropes).toHaveLength(1);
    expect(s.ropes[0]!.members).toEqual([0, 1, 2]);
    expect(s.ropes[0]!.links[0]!.len).toBe(ROPE_LEN);
    expect(s.hazard).toMatchObject({ kind: 'risingLava', frozen: false });
    expect(s.checkpoints).toEqual([{ x: 35, y: 8, activated: false, active: false }]);
    expect(s.goal).toEqual({ x: 56 * TILE - 24, y: 7 * TILE - 48, w: 96, h: 96 });
    expect(s.mode).toBe('chain');
    expect(s.grid).toBe(w.grid);
  });
  it('createWorld refuses a level that does not parse', () => {
    expect(() => createWorld({ level: level(['#..#', '#..#']), slots: [0, 1] })).toThrow(/want exactly one S/);
  });
  it('a cleared world is frozen: step returns no events and time stops', () => {
    const w = world(level(hall()), { mode: 'free' });
    const g = w.level.markers.goal[0]!;
    teleport(w, 0, g.x, g.y); teleport(w, 1, g.x, g.y);
    run(w, 3);
    expect(w.status).toBe('cleared');
    const t = w.tick;
    expect(names(run(w, 10))).toEqual([]);
    expect(w.tick).toBe(t);
  });
});
