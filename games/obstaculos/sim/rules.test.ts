import { describe, expect, it } from 'vitest';
import { DIFFICULTY_PARAMS, TILE } from '../constants';
import { LEVEL_01 } from '../levels';
import { parseLevelStrict } from '../parse';
import { advanceRun, awards, levelScore, medalFor, newRun, progressField } from './rules';
import { clearLevel, draw, hall, inp, level, of, pl, run, teleport, world } from './testkit/testkit';
import { setConnected, step } from './world';

const GROUND = 11;
const SPIKES = draw(hall(), [14, 12, '^^^^']);

describe('death, respawn and lives (plan §8)', () => {
  it('spikes kill; the team loses 1 life; the dead return at the spawn after 1 s with 1 s of invulnerability', () => {
    const w = world(level(SPIKES), { mode: 'free' });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 3, GROUND);
    let died: ReturnType<typeof of<'obst.death'>> = [];
    for (let i = 0; i < 100 && !died.length; i++)
      died = of(
        run(w, 1, (s) => (s === 0 ? inp({ move: 1 }) : undefined)),
        'obst.death',
      );
    expect(died).toEqual([{ player: 0, cause: 'spikes' }]);
    expect(w.lives).toBe(11);
    expect(w.deaths).toBe(1);
    expect(pl(w, 0).mode).toBe('dead');
    const ev = run(w, 70);
    expect(of(ev, 'obst.respawn')).toEqual([{ player: 0, via: 'checkpoint' }]);
    const spawn = w.level.markers.spawn[0]!;
    expect(Math.abs(pl(w, 0).body.x + 17 - (spawn.x * TILE + TILE / 2))).toBeLessThan(40); // beside the spawn (spread)
    expect(pl(w, 0).invuln).toBeGreaterThan(0);
    expect(pl(w, 0).invuln).toBeLessThanOrEqual(60);
  });
  it('invulnerable players walk over spikes', () => {
    const w = world(level(SPIKES), { mode: 'free' });
    teleport(w, 1, 3, GROUND);
    teleport(w, 0, 13, GROUND);
    pl(w, 0).invuln = 200;
    run(w, 30, (s) => (s === 0 ? inp({ move: 1 }) : undefined));
    expect(pl(w, 0).mode).toBe('active');
  });
  it('liquid and the void kill with their own cause', () => {
    const rows = draw(hall(), [14, 12, '~~~~'], [24, 12, '..'], [24, 13, '..']);
    const w = world(level(rows), { mode: 'free' });
    teleport(w, 0, 12, GROUND);
    teleport(w, 1, 23, GROUND);
    const ev = run(w, 120, (s) => inp({ move: s === 0 ? 1 : 1 }));
    expect(
      of(ev, 'obst.death')
        .map((d) => `${d.player}:${d.cause}`)
        .sort(),
    ).toEqual(['0:liquid', '1:fall']);
  });
  it('two deaths in the same step cost one life; if nobody is left, the team returns at once (via team)', () => {
    const w = world(level(SPIKES), { mode: 'free' });
    teleport(w, 0, 15, 11);
    teleport(w, 1, 16, 11);
    pl(w, 0).body.y += 20;
    pl(w, 1).body.y += 20; // inside the spikes
    const ev = run(w, 1);
    expect(of(ev, 'obst.death')).toHaveLength(2);
    expect(w.lives).toBe(11);
    expect(of(ev, 'obst.respawn')).toEqual([
      { player: 0, via: 'team' },
      { player: 1, via: 'team' },
    ]);
    expect(w.players.map((p) => p.mode)).toEqual(['active', 'active']);
  });
  it('0 lives: the level fails and the world stops (hard: 6 lives)', () => {
    const w = world(level(SPIKES), { mode: 'free', difficulty: 'hard', slots: [0, 1] });
    expect(w.lives).toBe(6);
    for (let k = 0; k < 6; k++) {
      expect(w.status).toBe('playing');
      teleport(w, 0, 15, 11);
      pl(w, 0).body.y += 20;
      pl(w, 0).invuln = 0;
      run(w, 70);
    }
    expect(w.lives).toBe(0);
    expect(w.status).toBe('failed');
    const t = w.tick;
    expect(step(w, [])).toEqual([]);
    expect(w.tick).toBe(t);
  });
  it('easy has unlimited lives: they never run out', () => {
    const w = world(level(SPIKES), { mode: 'free', difficulty: 'easy' });
    for (let k = 0; k < 20; k++) {
      teleport(w, 0, 15, 11);
      pl(w, 0).body.y += 20;
      pl(w, 0).invuln = 0;
      run(w, 70);
    }
    expect(w.lives).toBe(Infinity);
    expect(w.status).toBe('playing');
    expect(w.deaths).toBe(20);
  });
  it('a body inside a solid for 2 steps is crushed', () => {
    const w = world(level(hall()), { mode: 'free' });
    teleport(w, 0, 10, 12);
    teleport(w, 1, 3, GROUND); // inside the floor
    pl(w, 0).body.y = 12 * TILE + 5;
    const ev = run(w, 3);
    expect(of(ev, 'obst.death')).toEqual([{ player: 0, cause: 'crush' }]);
  });
});

describe('checkpoints and reunion', () => {
  const lvl = () => level(draw(hall(80, 14), [30, GROUND, 'P'], [60, GROUND, 'P']), {});
  it('any player activates it once; deaths then return to it and not to the spawn', () => {
    const w = world(lvl(), { mode: 'free' });
    teleport(w, 0, 30, GROUND);
    teleport(w, 1, 28, GROUND);
    const ev = run(w, 3);
    expect(of(ev, 'obst.checkpoint')).toEqual([{ player: 0, index: 0 }]);
    expect(run(w, 30).filter((e) => e.name === 'obst.checkpoint')).toHaveLength(0);
    expect(w.activeCheckpoint).toBe(0);
    const r = w.ent.checkpoints[0]!.cell;
    pl(w, 0).body.y = 13 * TILE; // into the floor: crushed
    run(w, 80);
    expect(Math.abs(pl(w, 0).body.x + 17 - (r.x * TILE + TILE / 2))).toBeLessThan(40);
  });
  it('reunion: the one more than a screen behind appears at the new checkpoint, the one close by does not', () => {
    const w = world(lvl(), { mode: 'free', slots: [0, 1, 2] });
    teleport(w, 0, 60, GROUND);
    teleport(w, 1, 5, GROUND);
    teleport(w, 2, 50, GROUND);
    const x2 = pl(w, 2).body.x;
    const ev = run(w, 3);
    const rs = of(ev, 'obst.respawn');
    expect(rs).toEqual([{ player: 1, via: 'checkpoint' }]);
    expect(pl(w, 1).body.x).toBeGreaterThan(59 * TILE);
    expect(pl(w, 1).invuln).toBeGreaterThan(0);
    expect(pl(w, 2).body.x).toBe(x2);
  });
  it('a checkpoint behind the active one does not take its place', () => {
    const w = world(lvl(), { mode: 'free' });
    teleport(w, 0, 60, GROUND);
    teleport(w, 1, 61, GROUND);
    run(w, 3);
    expect(w.activeCheckpoint).toBe(1);
    teleport(w, 0, 30, GROUND);
    run(w, 3);
    expect(w.ent.checkpoints[0]!.activated).toBe(true);
    expect(w.activeCheckpoint).toBe(1);
  });
});

describe('stars and goal', () => {
  it('stars are taken once, a second one within 3 s extends the streak, a late one starts over', () => {
    const w = world(level(draw(hall(), [10, GROUND, '*'], [12, GROUND, '*'], [30, GROUND, '*'])), { mode: 'free' });
    teleport(w, 1, 3, GROUND);
    teleport(w, 0, 10, GROUND);
    const a = of(run(w, 2), 'obst.star');
    expect(a).toEqual([{ player: 0, index: 0, streak: 1 }]);
    teleport(w, 0, 12, GROUND);
    expect(of(run(w, 2), 'obst.star')).toEqual([{ player: 0, index: 1, streak: 2 }]);
    teleport(w, 0, 10, GROUND);
    expect(of(run(w, 2), 'obst.star')).toEqual([]); // already taken
    run(w, 200);
    teleport(w, 0, 30, GROUND);
    expect(of(run(w, 2), 'obst.star')).toEqual([{ player: 0, index: 2, streak: 1 }]);
    expect(pl(w, 0).stats.stars).toBe(3);
  });
  it('the level is cleared only when every connected player is in the goal; the leaver stops counting', () => {
    const w = world(level(hall()), { mode: 'free', slots: [0, 1, 2] });
    const g = w.level.markers.goal[0]!;
    teleport(w, 0, g.x, g.y);
    teleport(w, 1, g.x, g.y);
    teleport(w, 2, 3, GROUND);
    const ev = run(w, 3);
    expect(of(ev, 'obst.goalEnter').map((e) => `${e.inside}/${e.total}`)).toEqual(['1/3', '2/3']);
    expect(w.status).toBe('playing');
    setConnected(w, 2, false);
    const ev2 = run(w, 2);
    expect(w.status).toBe('cleared');
    expect(of(ev2, 'obst.levelClear')).toHaveLength(1);
  });
  it('a dead player in the goal does not count; victory result carries time, medal, stars and deaths', () => {
    const w = world(level(draw(hall(), [10, GROUND, '*']), { parSec: 10 }), { mode: 'free' });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 3, GROUND);
    run(w, 5);
    run(w, 60);
    clearLevel(w);
    expect(w.status).toBe('cleared');
    expect(w.result).toEqual({ timeSec: w.tick / 60, medal: 'gold', stars: 1, deaths: 0, livesLeft: 12 });
  });
});

describe('score (plan §8)', () => {
  it('1000 x (1 / 1.5 / 2) + 10 per second under par + 100 per star + 50 per life', () => {
    expect(levelScore({ difficulty: 'normal', parSec: 75, timeSec: 60.4, stars: 2, livesLeft: 10 })).toBe(1500 + 140 + 200 + 500);
    expect(levelScore({ difficulty: 'easy', parSec: 75, timeSec: 80, stars: 0, livesLeft: Infinity })).toBe(1000);
    expect(levelScore({ difficulty: 'hard', parSec: 75, timeSec: 75, stars: 3, livesLeft: 4 })).toBe(2000 + 300 + 200);
    expect(levelScore({ difficulty: 'normal', parSec: 75, timeSec: 60.4, stars: 2, livesLeft: 10, retry: true })).toBe(
      Math.round((1500 + 140 + 200 + 500) / 2),
    );
  });
  it('medal: gold within par, silver within 1.5 par, bronze after', () => {
    expect([medalFor(75, 75), medalFor(75.1, 75), medalFor(112.5, 75), medalFor(112.6, 75)]).toEqual([
      'gold',
      'silver',
      'silver',
      'bronze',
    ]);
  });
});

describe('the expedition: 3 levels, one retry', () => {
  const play = (clear: boolean) => {
    const w = world(level(hall()), { mode: 'free' });
    if (clear) clearLevel(w);
    else {
      w.status = 'failed';
    }
    return w;
  };
  it('three clears end the run as complete with the sum of the scores', () => {
    const run_ = newRun();
    let end: string[] = [];
    for (let i = 0; i < 3; i++) {
      const w = play(true);
      expect(w.status).toBe('cleared');
      end = advanceRun(run_, w).map((e) => e.name);
    }
    expect(end).toEqual(['obst.runEnd']);
    expect(run_).toMatchObject({ ended: 'complete', cleared: 3, index: 3 });
    expect(run_.score).toBe(3 * levelScore({ difficulty: 'normal', parSec: 60, timeSec: 5 / 60, stars: 0, livesLeft: 12 }));
  });
  it('the first failure repeats the level at x0.5; the second failure closes the expedition', () => {
    const r = newRun();
    expect(advanceRun(r, play(false))).toEqual([]);
    expect(r).toMatchObject({ index: 0, retrying: true, failures: 1, ended: null });
    advanceRun(r, play(true));
    const retried = levelScore({ difficulty: 'normal', parSec: 60, timeSec: 5 / 60, stars: 0, livesLeft: 12, retry: true });
    expect(r.score).toBe(retried);
    expect(r).toMatchObject({ index: 1, retrying: false });
    const ev = advanceRun(r, play(false));
    expect(ev).toEqual([{ name: 'obst.runEnd', data: { score: retried, levels: 1, reason: 'failed' } }]);
    expect(r.ended).toBe('failed');
    expect(advanceRun(r, play(true))).toEqual([]); // a finished run ignores more worlds
  });
  it('a world still playing does nothing', () => {
    const r = newRun();
    advanceRun(r, world(level(hall()), { mode: 'free' }));
    expect(r).toEqual(newRun());
  });
});

describe('stragglers and bubbles (plan §6)', () => {
  // P0 stands near the goal (ahead), P1 far behind. `off` says who is out of the camera.
  const lvl = () => level(hall(80, 14));
  const setup = (difficulty: 'easy' | 'normal' | 'hard' = 'normal') => {
    const w = world(lvl(), { mode: 'free', difficulty });
    teleport(w, 0, 60, GROUND);
    teleport(w, 1, 5, GROUND);
    return w;
  };
  const off = (slot: number) => (): boolean[] => [slot === 0, slot === 1];
  it('after bubbleSec out of the camera the straggler becomes a bubble (reason offscreen), for free on Normal', () => {
    const w = setup();
    const ev = run(w, 119, undefined, undefined, off(1));
    expect(of(ev, 'obst.bubble')).toEqual([]);
    const ev2 = run(w, 2, undefined, undefined, off(1));
    expect(of(ev2, 'obst.bubble')).toEqual([{ player: 1, reason: 'offscreen' }]);
    expect(pl(w, 1).mode).toBe('bubble');
    expect(w.lives).toBe(12);
  });
  it('the one running ahead alone is a stray (same bubble, reason stray)', () => {
    const w = setup();
    const ev = run(w, 125, undefined, undefined, off(0));
    expect(of(ev, 'obst.bubble')).toEqual([{ player: 0, reason: 'stray' }]);
  });
  it('the timer resets when the player is back in the camera; Easy waits 1 s, Hard 3 s', () => {
    const w = setup();
    run(w, 100, undefined, undefined, off(1));
    run(w, 1, undefined, undefined, () => [false, false]);
    expect(of(run(w, 100, undefined, undefined, off(1)), 'obst.bubble')).toEqual([]);
    const e = setup('easy');
    expect(of(run(e, 65, undefined, undefined, off(1)), 'obst.bubble')).toHaveLength(1);
    const h = setup('hard');
    expect(of(run(h, 170, undefined, undefined, off(1)), 'obst.bubble')).toHaveLength(0);
    expect(of(run(h, 20, undefined, undefined, off(1)), 'obst.bubble')).toHaveLength(1);
    expect(DIFFICULTY_PARAMS.hard.bubbleSec).toBe(3);
  });
  it('on Hard the bubble costs a life', () => {
    const w = setup('hard');
    run(w, 185, undefined, undefined, off(1));
    expect(w.lives).toBe(5);
  });
  it('the bubble flies to the median’s safe crumb at 9 tiles/s, pops 0.4 s after arriving and leaves 1 s of invulnerability', () => {
    const w = setup();
    run(w, 130, undefined, undefined, off(1)); // bubble since step ~120, P0 has been standing for 2 s: crumbs exist
    expect(pl(w, 1).mode).toBe('bubble');
    const crumb = pl(w, 0).crumbs[pl(w, 0).crumbs.length - 1]!;
    expect(pl(w, 1).crumbs.length).toBeGreaterThan(0);
    const startX = pl(w, 1).body.x;
    const dist = Math.hypot(crumb.x - startX, crumb.y - pl(w, 1).body.y);
    const ev: ReturnType<typeof run> = [];
    let arrived = -1;
    for (let i = 0; i < 400; i++) {
      ev.push(...run(w, 1, undefined, undefined, off(1)));
      if (pl(w, 1).bubble?.arrived && arrived < 0) arrived = i;
      if (pl(w, 1).mode === 'active') break;
    }
    const flight = (Math.hypot(pl(w, 0).body.x - startX, 0) / (9 * TILE)) * 60;
    expect(arrived).toBeGreaterThan(flight * 0.8 - 12);
    expect(arrived).toBeLessThan(flight * 1.2 + 12);
    expect(dist).toBeGreaterThan(1000);
    expect(of(ev, 'obst.respawn')).toEqual([{ player: 1, via: 'bubble' }]);
    expect(pl(w, 1).mode).toBe('active');
    expect(pl(w, 1).invuln).toBeGreaterThan(50);
    expect(Math.abs(pl(w, 1).body.x - pl(w, 0).body.x)).toBeLessThan(80); // landed next to the median
  });
  it('a lone player has nobody to return to: no bubble', () => {
    const w = world(lvl(), { mode: 'free', slots: [0] });
    expect(
      of(
        run(w, 400, undefined, undefined, () => [true]),
        'obst.bubble',
      ),
    ).toEqual([]);
  });
});

describe('progress and awards', () => {
  it('progressField: the goal is 0, a neighbour 1, the spawn is far, solid cells are never "near"', () => {
    const p = parseLevelStrict(LEVEL_01);
    const f = progressField(p);
    const g = p.markers.goal[0]!,
      s = p.markers.spawn[0]!;
    expect(f[g.y * p.w + g.x]).toBe(0);
    expect(f[g.y * p.w + g.x - 1]).toBe(1);
    expect(f[s.y * p.w + s.x]).toBeGreaterThan(50);
    expect(f[12 * p.w + 20]).toBeGreaterThan(1000); // inside the floor
  });
  it('awards: Ancla, Taxi, Coleccionista, Kamikaze and Pegamento go to the slot with the most (or the least time off camera)', () => {
    const w = world(level(hall()), { mode: 'free', slots: [0, 1, 2] });
    pl(w, 0).stats.anchoredSteps = 90;
    pl(w, 1).stats.throws = 2;
    pl(w, 2).stats.catches = 1;
    pl(w, 1).stats.stars = 3;
    pl(w, 2).stats.deaths = 4;
    pl(w, 0).stats.offCameraSteps = 50;
    pl(w, 1).stats.offCameraSteps = 0;
    pl(w, 2).stats.offCameraSteps = 10;
    expect(awards(w)).toEqual({ ancla: 0, taxi: 1, coleccionista: 1, kamikaze: 2, pegamento: 1 });
    const empty = world(level(hall()), { mode: 'free', slots: [0, 1] });
    expect(awards(empty)).toMatchObject({ ancla: null, taxi: null, coleccionista: null, kamikaze: null });
  });
});
