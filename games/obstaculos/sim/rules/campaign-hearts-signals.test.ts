// Campaign layer for 2: shared hearts, bubble v2 and signals (plan §5.1). Every rule has its quick-match twin that must NOT show it.

import { describe, expect, it } from 'vitest';
import { TILE } from '../../constants';
import { clearLevel, draw, hall, inp, level, names, of, pl, run, teleport, world } from '../testkit/testkit';
import { snapshot, step } from '../world';

const GROUND = 11;
const camp = (n?: number) => ({ campaign: { world: 'forest' as const, n } });
const kill = (w: ReturnType<typeof world>, slot: number) => {
  pl(w, slot).body.y = w.level.h * TILE + 300;
}; // out of the grid: 'fall'

describe('shared hearts (plan §5.1)', () => {
  it('one falls: it flies to the partner in a bubble (no 1 s wait), costs one heart and rejoins invulnerable', () => {
    const w = world(level(hall(80)), { mode: 'free', ...camp() });
    teleport(w, 0, 60, GROUND);
    teleport(w, 1, 5, GROUND);
    run(w, 5);
    kill(w, 1);
    const ev = run(w, 1);
    expect(of(ev, 'obst.death')).toEqual([{ player: 1, cause: 'fall' }]);
    expect(of(ev, 'obst.bubble')).toEqual([{ player: 1, reason: 'death' }]);
    expect(pl(w, 1).mode).toBe('bubble');
    expect(w.lives).toBe(5);
    expect(w.heartsLost).toBe(1);
    let inv = 0;
    const ev2 = run(w, 600, undefined, (e) => {
      if (of(e, 'obst.respawn').length) inv = pl(w, 1).invuln;
    });
    expect(of(ev2, 'obst.respawn')).toEqual([{ player: 1, via: 'bubble' }]);
    expect(pl(w, 1).mode).toBe('active');
    expect(inv).toBe(60);
    expect(Math.abs(pl(w, 1).body.x - pl(w, 0).body.x)).toBeLessThan(10 * TILE); // beside the partner, not at the spawn
  });
  it('quick match: the fallen waits 1 s and returns at the checkpoint (no bubble)', () => {
    const w = world(level(hall(80)), { mode: 'free' });
    teleport(w, 0, 60, GROUND);
    teleport(w, 1, 5, GROUND);
    run(w, 5);
    kill(w, 1);
    const ev = run(w, 90);
    expect(of(ev, 'obst.bubble')).toEqual([]);
    expect(of(ev, 'obst.respawn')).toEqual([{ player: 1, via: 'checkpoint' }]);
  });
  it('both fall in the same step: one heart, both back at the checkpoint at once, no bubbles', () => {
    const w = world(level(hall(80)), { mode: 'free', ...camp() });
    teleport(w, 0, 60, GROUND);
    teleport(w, 1, 5, GROUND);
    run(w, 5);
    kill(w, 0);
    kill(w, 1);
    const ev = run(w, 1);
    expect(of(ev, 'obst.respawn')).toEqual([
      { player: 0, via: 'team' },
      { player: 1, via: 'team' },
    ]);
    expect(names(ev)).not.toContain('obst.bubble');
    expect(w.lives).toBe(5);
    expect(pl(w, 0).body.x).toBeLessThan(5 * TILE);
  });
  it('0 hearts: hearts refill, the team returns to the checkpoint, the level goes on (never "failed") and the third star is gone', () => {
    const rows = draw(hall(80), [20, GROUND, 'P']);
    const w = world(level(rows), { mode: 'free', ...camp() });
    teleport(w, 0, 20, GROUND);
    teleport(w, 1, 21, GROUND);
    run(w, 5);
    expect(w.activeCheckpoint).toBe(0);
    teleport(w, 0, 40, GROUND);
    teleport(w, 1, 41, GROUND);
    let out: ReturnType<typeof run> = [];
    for (let i = 0; i < 6; i++) {
      kill(w, 0);
      kill(w, 1);
      out = run(w, 3);
    }
    expect(of(out, 'obst.heartsOut')).toEqual([{ toStart: false }]);
    expect(w.status).toBe('playing');
    expect(w.lives).toBe(6);
    expect(w.refills).toBe(1);
    expect(pl(w, 0).mode).toBe('active');
    expect(pl(w, 0).body.x).toBeGreaterThan(18 * TILE);
    expect(pl(w, 0).body.x).toBeLessThan(23 * TILE); // at the checkpoint, not at the spawn
    clearLevel(w);
    expect(w.status).toBe('cleared');
    expect(w.result!.campaign).toEqual({ heartsLost: 6, refills: 1, perfect: false });
  });
  it('Summit: 0 hearts goes back to the very start (checkpoints re-arm)', () => {
    const rows = draw(hall(80), [20, GROUND, 'P']);
    const w = world(level(rows), { mode: 'free', campaign: { world: 'summit' } });
    teleport(w, 0, 20, GROUND);
    teleport(w, 1, 21, GROUND);
    run(w, 5);
    expect(w.activeCheckpoint).toBe(0);
    teleport(w, 0, 40, GROUND);
    teleport(w, 1, 41, GROUND);
    let out: ReturnType<typeof run> = [];
    for (let i = 0; i < 3; i++) {
      kill(w, 0);
      kill(w, 1);
      out = run(w, 3);
    }
    expect(of(out, 'obst.heartsOut')).toEqual([{ toStart: true }]);
    expect(w.lives).toBe(3);
    expect(w.activeCheckpoint).toBe(-1);
    expect(w.ent.checkpoints[0]!.activated).toBe(false);
    expect(pl(w, 0).body.x).toBeLessThan(6 * TILE);
  });
  it('Beach: unlimited hearts never refill, but the lost ones are counted (the caller decides about the third star)', () => {
    const w = world(level(hall(80)), { mode: 'free', campaign: { world: 'beach' } });
    teleport(w, 0, 40, GROUND);
    teleport(w, 1, 41, GROUND);
    for (let i = 0; i < 10; i++) {
      kill(w, 0);
      kill(w, 1);
      run(w, 3);
    }
    expect(w.lives).toBe(Infinity);
    expect(w.heartsLost).toBe(10);
    expect(w.refills).toBe(0);
    clearLevel(w);
    expect(w.result!.campaign).toEqual({ heartsLost: 10, refills: 0, perfect: false });
  });
  it('a clean level is perfect', () => {
    const w = world(level(hall()), { mode: 'free', ...camp() });
    clearLevel(w);
    expect(w.result!.campaign).toEqual({ heartsLost: 0, refills: 0, perfect: true });
  });
});

describe('bubble v2: mashing A speeds it up', () => {
  const fly = (mash: boolean) => {
    const w = world(level(hall(80)), { mode: 'free', ...camp() });
    teleport(w, 0, 70, GROUND);
    teleport(w, 1, 5, GROUND);
    run(w, 5);
    kill(w, 1);
    run(w, 1);
    let t = 0;
    for (; t < 900 && pl(w, 1).mode !== 'active'; t++) run(w, 1, (s) => (mash && s === 1 ? inp({ jump: true }) : undefined));
    return t;
  };
  it('the same trip takes less than half the time with A mashed', () => {
    const slow = fly(false),
      fast = fly(true);
    expect(slow).toBeGreaterThan(200);
    expect(fast).toBeLessThan(slow * 0.5);
  });
  it('the boost fades when the mashing stops', () => {
    const w = world(level(hall(80)), { mode: 'free', ...camp() });
    teleport(w, 0, 70, GROUND);
    teleport(w, 1, 5, GROUND);
    run(w, 5);
    kill(w, 1);
    run(w, 10, (s) => (s === 1 ? inp({ jump: true }) : undefined));
    expect(pl(w, 1).camp.mash).toBe(4);
    run(w, 60);
    expect(pl(w, 1).camp.mash).toBe(0);
  });
});

describe('dynamic 1: signals', () => {
  it('a signal shows for 2 s over the head and fires obst.signal, from an active player and from a bubble', () => {
    const w = world(level(hall(80)), { mode: 'free', ...camp() });
    teleport(w, 0, 70, GROUND);
    teleport(w, 1, 5, GROUND);
    run(w, 5);
    const ev = run(w, 1, (s) => (s === 0 ? inp({ signal: 'wait' }) : undefined));
    expect(of(ev, 'obst.signal')).toEqual([{ player: 0, kind: 'wait' }]);
    expect(snapshot(w).players[0]!.signal).toBe('wait');
    run(w, 110);
    expect(snapshot(w).players[0]!.signal).toBe('wait'); // still there at 1.9 s
    run(w, 20);
    expect(snapshot(w).players[0]!.signal).toBeNull(); // gone after 2 s
    kill(w, 1);
    run(w, 1);
    expect(pl(w, 1).mode).toBe('bubble');
    const ev2 = run(w, 1, (s) => (s === 1 ? inp({ signal: 'arrowR' }) : undefined));
    expect(of(ev2, 'obst.signal')).toEqual([{ player: 1, kind: 'arrowR' }]);
  });
  it('holding "go" for 0.4 s starts a 3-2-1 one number per second, then 0 ("ya"); releasing before 0.4 s starts nothing', () => {
    const w = world(level(hall(80)), { mode: 'free', ...camp() });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 12, GROUND);
    run(w, 5);
    expect(
      of(
        run(w, 20, (s) => (s === 0 ? inp({ goHeld: true }) : undefined)),
        'obst.countdown',
      ),
    ).toEqual([]);
    run(w, 10);
    const marks: [number, number][] = [];
    const t0 = w.tick;
    run(
      w,
      40,
      (s) => (s === 0 ? inp({ goHeld: true }) : undefined),
      (ev) => {
        for (const c of of(ev, 'obst.countdown')) marks.push([w.tick - t0, c.n]);
      },
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]![1]).toBe(3);
    expect(snapshot(w).countdown).toEqual({ by: 0, n: 3 });
    const t3 = marks[0]![0] + t0;
    const rest: [number, number][] = [];
    run(w, 200, undefined, (ev) => {
      for (const c of of(ev, 'obst.countdown')) rest.push([w.tick - t3, c.n]);
    });
    expect(rest).toEqual([
      [60, 2],
      [120, 1],
      [180, 0],
    ]);
    expect(snapshot(w).countdown).toBeNull();
  });
  it('a dead player cannot signal', () => {
    const w = world(level(hall(80)), { mode: 'free', ...camp() });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 12, GROUND);
    run(w, 5);
    kill(w, 0);
    kill(w, 1); // both: dead for a step, then the team returns
    pl(w, 0).mode = 'dead';
    pl(w, 0).timer = 30;
    const ev = step(w, [inp({ signal: 'go' })]);
    expect(of(ev, 'obst.signal')).toEqual([]);
  });
});
