import { describe, expect, it } from 'vitest';
import { DT, EXPEDITION_LEVELS, STEP_MS } from './constants';
import { LEVELS } from './levels';
import { RANDOM_LEVEL, compatibleLevels, fixedExpedition, levelCompat, parseObstOptions, resolveLevel, setupLabel } from './lobby';
import { BETWEEN_MS, COUNTDOWN_MS, NEXT_COUNTDOWN_MS, OVER_HOLD_MS, ObstSession, planExpedition, type SessionOpts } from './session';
import { hashState, snapshot } from './sim/world';
import { levelScore } from './sim/rules';
import { teleport } from './sim/testkit';
import type { ObstEvent } from './sim/state';
import { ObstBot } from './bot';
import { DIFFICULTY_LABEL } from '@pichi/core/difficulty';

const FRAME = 1000 / 60;
const mk = (o: Partial<SessionOpts> = {}) =>
  new ObstSession({ mode: 'free', difficulty: 'normal', level: 1, seed: 7, slots: [0, 1], ...o });
const names = (ev: ObstEvent[]) => ev.map((e) => e.name);
// Steps the session for `ms` of render time in 60 Hz frames, collecting every event.
function advance(s: ObstSession, ms: number, each?: () => void): ObstEvent[] {
  const out: ObstEvent[] = [];
  for (let t = 0; t < ms; t += FRAME) {
    each?.();
    out.push(...s.advance(FRAME));
  }
  return out;
}
const startPlaying = (s: ObstSession) => {
  advance(s, COUNTDOWN_MS + 50);
  expect(s.status).toBe('playing');
};
// Everybody in the goal at once: the level is cleared on the next step.
function winNow(s: ObstSession): ObstEvent[] {
  const g = s.world.level.markers.goal[0]!;
  for (const p of s.world.players) if (p.connected) teleport(s.world, p.slot, g.x, g.y);
  return advance(s, 200);
}
// Everybody dies at once until the lives run out (Hard has 6): the spawn is moved over the water of level 1.
function failNow(s: ObstSession): void {
  for (let i = 0; i < 60 && s.world.status === 'playing'; i++) {
    for (const p of s.world.players) if (p.connected && p.mode === 'active') p.body.y = s.world.level.h * 48 + 300;
    advance(s, 40);
  }
}

describe('lobby options and the levels the selector offers', () => {
  it('modeOptions fall back to the defaults one field at a time', () => {
    expect(parseObstOptions(undefined)).toEqual({ tether: 'chain', level: 1 });
    expect(parseObstOptions({ tether: 'free', level: 9 })).toEqual({ tether: 'free', level: 9 });
    expect(parseObstOptions({ tether: 'rope', level: 99 })).toEqual({ tether: 'chain', level: 1 });
    expect(parseObstOptions({ tether: 'free', level: 'x' })).toEqual({ tether: 'free', level: 1 });
    expect(parseObstOptions({ level: 0 }).level).toBe(RANDOM_LEVEL);
  });
  it('the selector hides what does not fit: 11 levels with 2 players in Encadenados and 12 with 8, as the plan says', () => {
    expect(compatibleLevels(2, 'chain')).toHaveLength(11);
    expect(compatibleLevels(8, 'chain')).toHaveLength(12);
    expect(compatibleLevels(2, 'free').map((l) => l.id)).not.toContain('l14'); // lava: Encadenados only
    expect(compatibleLevels(4, 'free').map((l) => l.id)).toContain('l08'); // the balance: Libres only
    expect(compatibleLevels(2, 'chain').map((l) => l.id)).not.toContain('l08');
    expect(levelCompat(LEVELS[7]!, 2, 'free')).toEqual({ ok: false, reason: 'mín. 4 jug.' });
    expect(levelCompat(LEVELS[8]!, 8, 'free').ok).toBe(false); // level 9: 2-4 players
  });
  it('a choice that stops fitting moves to the next level that does, then to the previous one, then to random', () => {
    expect(resolveLevel(8, 4, 'chain')).toBe(9);
    expect(resolveLevel(15, 2, 'free')).toBe(13);
    expect(resolveLevel(5, 4, 'free')).toBe(5);
    expect(resolveLevel(RANDOM_LEVEL, 4, 'free')).toBe(RANDOM_LEVEL);
  });
  it('an expedition is the chosen level and the next compatible ones, shorter near the end of the list', () => {
    expect(fixedExpedition(1, 4, 'free').map((l) => l.id)).toEqual(['l01', 'l02', 'l03']);
    expect(fixedExpedition(8, 4, 'chain').map((l) => l.id)).toEqual(['l09', 'l10', 'l11']); // 8 is Libres only: the next that fits
    expect(fixedExpedition(14, 4, 'chain').map((l) => l.id)).toEqual(['l14', 'l15']);
    expect(planExpedition({ mode: 'free', difficulty: 'normal', level: 1, seed: 1 }, 2)).toHaveLength(3);
  });
  it('the setup line says difficulty, mode and where the expedition starts', () => {
    expect(setupLabel({ tether: 'chain', level: 3 }, 'easy', 5, DIFFICULTY_LABEL)).toBe('Fácil · Encadenados · Desde el nivel 3');
    expect(setupLabel({ tether: 'free', level: 0 }, 'hard', 1234, DIFFICULTY_LABEL)).toBe('Difícil · Libres · Aleatorio 1234');
  });
  it('random levels come from the seeds s, s+1 and s+2: the same seed gives the same expedition, another seed another one', () => {
    const a = planExpedition({ mode: 'free', difficulty: 'easy', level: 0, seed: 11 }, 3);
    const b = planExpedition({ mode: 'free', difficulty: 'easy', level: 0, seed: 11 }, 3);
    const c = planExpedition({ mode: 'free', difficulty: 'easy', level: 0, seed: 12 }, 3);
    expect(a.map((l) => l.id)).toEqual(['gen-11', 'gen-12', 'gen-13']);
    expect(a.map((l) => l.rows.join('\n'))).toEqual(b.map((l) => l.rows.join('\n')));
    expect(c.map((l) => l.id)).toEqual(['gen-12', 'gen-13', 'gen-14']);
    expect(c[0]!.rows.join('\n')).toBe(a[1]!.rows.join('\n')); // seed 12 is the second level of seed 11
  }, 120_000);
});

describe('the clock: 60 Hz fixed steps from the last input', () => {
  it('nothing moves during the 3-2-1; the first step of the level comes right after', () => {
    const s = mk();
    advance(s, COUNTDOWN_MS - 200);
    expect(s.status).toBe('countdown');
    expect(s.world.tick).toBe(0);
    advance(s, 400);
    expect(s.status).toBe('playing');
    advance(s, 500);
    expect(s.world.tick).toBeGreaterThan(20);
  });
  it('a frame never runs more than 4 steps (a long stall does not spiral) and the leftover is the interpolation alpha', () => {
    const s = mk();
    startPlaying(s);
    const t0 = s.world.tick;
    s.advance(500);
    expect(s.world.tick - t0).toBe(4);
    s.advance(FRAME * 0.5);
    expect(s.alpha).toBeGreaterThan(0);
    expect(s.alpha).toBeLessThanOrEqual(1);
  });
  it('the number of steps follows the time that passes, whatever the frame length (30, 60 or 144 fps)', () => {
    for (const fps of [30, 60, 144]) {
      const s = mk();
      startPlaying(s);
      const t0 = s.world.tick,
        ms = 2000;
      for (let t = 0; t < ms; t += 1000 / fps) s.advance(1000 / fps);
      expect(Math.abs(s.world.tick - t0 - ms / STEP_MS), `${fps} fps`).toBeLessThanOrEqual(2.01);
    }
  });
  it('the latest stick wins and the previous one is not replayed: two phones, two different directions', () => {
    const s = mk();
    startPlaying(s);
    s.receive(0, { x: 1, y: 0, presses: [0, 0] });
    s.receive(1, { x: -1, y: 0, presses: [0, 0] });
    const x0 = [0, 1].map((i) => s.world.players[i]!.body.x);
    advance(s, 300);
    expect(s.world.players[0]!.body.x).toBeGreaterThan(x0[0]! + 40);
    expect(s.world.players[1]!.body.x).toBeLessThan(x0[1]! - 20);
    s.receive(0, { x: -1, y: 0, presses: [0, 0] }); // the new packet replaces the old direction
    const x1 = s.world.players[0]!.body.x;
    advance(s, 600);
    expect(s.world.players[0]!.body.x).toBeLessThan(x1);
  });
  it('a press counter that moves is ONE jump even if it moved by 5, and a tap made during the countdown does not jump at the start', () => {
    const s = mk();
    s.receive(0, { x: 0, y: 0, presses: [0, 0] }); // baseline
    s.receive(0, { x: 0, y: 0, presses: [3, 0] }); // taps during the 3-2-1
    advance(s, COUNTDOWN_MS + 100);
    expect(s.world.players[0]!.body.vy).toBe(0);
    const ev = (() => {
      s.receive(0, { x: 0, y: 0, presses: [8, 0] });
      return advance(s, 100);
    })();
    expect(names(ev).filter((n) => n === 'obst.jump')).toHaveLength(1);
  });
  it('a phone that goes quiet stops: the stick decays to zero instead of running forever', () => {
    const s = mk();
    startPlaying(s);
    s.receive(0, { x: 1, y: 0, presses: [0, 0] });
    advance(s, 800);
    const x = s.world.players[0]!.body.x;
    advance(s, 1500);
    expect(Math.abs(s.world.players[0]!.body.vx)).toBeLessThan(1);
    expect(s.world.players[0]!.body.x - x).toBeLessThan(120);
  });
  it('the same packets give the same hash, however the frames are cut', () => {
    const run = (frame: number) => {
      const s = mk({ slots: [0, 1, 2, 3] });
      for (let t = 0; t < COUNTDOWN_MS + 6000; t += frame) {
        if (Math.round(t / 100) % 7 === 0)
          for (const i of [0, 1, 2, 3])
            s.receive(i, { x: i % 2 ? 1 : -0.7, y: 0, presses: [Math.floor(t / 900) + i, Math.floor(t / 2500)] });
        s.advance(frame);
      }
      return s;
    };
    const a = run(FRAME),
      b = run(FRAME);
    expect(hashState(a.world)).toBe(hashState(b.world));
    expect(a.world.tick).toBeGreaterThan(300);
  });
});

describe('the expedition: levels, pauses, results', () => {
  it('clearing a level shows it for a while, then the next one starts with a short countdown and the connected phones', () => {
    const s = mk({ slots: [0, 1, 2], levels: LEVELS.slice(0, 3) });
    startPlaying(s);
    const ev = winNow(s);
    expect(names(ev)).toContain('obst.levelClear');
    expect(s.status).toBe('between');
    expect(s.summaries[0]).toMatchObject({ id: 'l01', cleared: true, retry: false });
    s.setConnected(2, false); // someone leaves before the next level
    const after = advance(s, BETWEEN_MS + 100);
    expect(names(after)).not.toContain('obst.runEnd');
    expect(s.levelIndex).toBe(1);
    expect(s.world.level.def.id).toBe('l02');
    expect(s.world.players.filter((p) => p.connected).map((p) => p.slot)).toEqual([0, 1]);
    expect(s.status).toBe('countdown');
    advance(s, NEXT_COUNTDOWN_MS + 100);
    expect(s.status).toBe('playing');
    expect(s.run.score).toBeGreaterThan(1000);
  });
  it('three cleared levels end the run as complete; the results hold the banner first, then ask for the screen', () => {
    const s = mk({ levels: LEVELS.slice(0, 3) });
    for (let i = 0; i < 3; i++) {
      startPlaying(s);
      winNow(s);
      const ev = advance(s, BETWEEN_MS + 100);
      if (i < 2) {
        expect(names(ev)).not.toContain('obst.runEnd');
        advance(s, NEXT_COUNTDOWN_MS + 50);
      } else expect(names(ev)).toContain('obst.runEnd');
    }
    expect(s.over).toBe(true);
    expect(s.overDue).toBe(false);
    advance(s, OVER_HOLD_MS + 100);
    expect(s.overDue).toBe(true);
    const r = s.summary()!;
    expect(r.reason).toBe('complete');
    expect(r.cleared).toBe(3);
    expect(r.levels.map((l) => l.id)).toEqual(['l01', 'l02', 'l03']);
    expect(r.levels.every((l) => l.cleared && l.medal)).toBe(true);
    expect(r.score).toBe(r.levels.reduce((a, l) => a + l.score, 0));
    expect(r.score).toBeGreaterThan(3000);
    expect(r.totals.timeSec).toBeGreaterThan(0);
    expect(r.levels[0]).toMatchObject({ checkpointsMax: 1, starsMax: 3, livesLeft: 12 });
  });
  it('with no lives left the level is retried at half score; a second failure closes the expedition', () => {
    const s = mk({ difficulty: 'hard', levels: LEVELS.slice(0, 3) });
    startPlaying(s);
    failNow(s);
    expect(s.world.status).toBe('failed');
    advance(s, BETWEEN_MS + 100);
    expect(s.run.retrying).toBe(true);
    expect(s.levelIndex).toBe(0);
    expect(s.world.lives).toBe(6); // a fresh world: the lives are back
    advance(s, NEXT_COUNTDOWN_MS + 50);
    winNow(s);
    advance(s, BETWEEN_MS + 100);
    expect(s.summaries[1]).toMatchObject({ retry: true, cleared: true });
    const r1 = s.summaries[1]!;
    expect(r1.score).toBe(
      levelScore({ difficulty: 'hard', parSec: r1.parSec, timeSec: r1.timeSec, stars: r1.stars, livesLeft: r1.livesLeft, retry: true }),
    );
    expect(r1.score).toBeLessThan(
      levelScore({ difficulty: 'hard', parSec: r1.parSec, timeSec: r1.timeSec, stars: r1.stars, livesLeft: r1.livesLeft }) * 0.51,
    );
    expect(s.summaries[0]).toMatchObject({ cleared: false, medal: null });
    // the second failure ends the run
    advance(s, NEXT_COUNTDOWN_MS + 50);
    failNow(s);
    advance(s, BETWEEN_MS + 100);
    expect(s.over).toBe(true);
    expect(s.summary()!.reason).toBe('failed');
  });
  it('a dropped phone does not stop the level, drops what it held, and its slot comes back at the checkpoint when it returns', () => {
    const s = mk({ slots: [0, 1, 2] });
    startPlaying(s);
    s.setConnected(1, false);
    expect(s.world.players.find((p) => p.slot === 1)!.connected).toBe(false);
    advance(s, 300);
    expect(s.world.status).toBe('playing');
    s.setConnected(1, true);
    expect(s.world.players.find((p) => p.slot === 1)!.connected).toBe(true);
    expect(s.connectedSlots).toEqual([0, 1, 2]);
    // the goal needs the connected ones only: 0 and 2 alone clear it while 1 is away
    s.setConnected(1, false);
    const g = s.world.level.markers.goal[0]!;
    teleport(s.world, 0, g.x, g.y);
    teleport(s.world, 2, g.x, g.y);
    expect(names(advance(s, 200))).toContain('obst.levelClear');
  });
  it('with every phone gone the clock waits: no lives are lost to an empty screen', () => {
    const s = mk();
    startPlaying(s);
    s.setConnected(0, false);
    s.setConnected(1, false);
    const t = s.world.tick;
    advance(s, 3000);
    expect(s.world.tick).toBe(t);
    s.setConnected(0, true);
    advance(s, 200);
    expect(s.world.tick).toBeGreaterThan(t);
  });
  it('the awards add up over the whole expedition (the most deaths is the Kamikaze of the run)', () => {
    const s = mk({ levels: LEVELS.slice(0, 2) });
    startPlaying(s);
    for (let i = 0; i < 3; i++) {
      s.world.players[1]!.body.y = 10_000;
      advance(s, 1300);
    }
    winNow(s);
    advance(s, BETWEEN_MS + NEXT_COUNTDOWN_MS + 300);
    startPlaying(s);
    winNow(s);
    advance(s, BETWEEN_MS + 100);
    expect(s.summary()!.awards.kamikaze).toBe(1);
    expect(s.summary()!.totals.deaths).toBeGreaterThanOrEqual(3);
  });
});

describe('explorers with phones: the bot completes the first two levels in Libres with 2, 4 and 8 players (real world, real inputs)', () => {
  // The bot reads the world like a screen would and answers like a phone: stick and two taps, through the same session.
  function play(levelIdx: number, n: number, mode: 'chain' | 'free', maxSec: number) {
    const slots = Array.from({ length: n }, (_, i) => i);
    const s = new ObstSession({ mode, difficulty: 'normal', level: 0, seed: 1, slots, levels: [LEVELS[levelIdx - 1]!] });
    const bots = slots.map((i) => new ObstBot(i));
    const taps = slots.map(() => [0, 0]);
    for (let f = 0; f < maxSec * 60 && s.world.status === 'playing'; f++) {
      const snap = snapshot(s.world);
      const view = { tick: s.world.tick, grid: s.world.grid, players: snap.players, goal: snap.goal };
      for (const i of slots) {
        const o = bots[i]!.decide(view);
        if (o.jump) taps[i]![0]!++;
        if (o.grab) taps[i]![1]!++;
        s.receive(i, { x: o.x, y: o.y, presses: [taps[i]![0]!, taps[i]![1]!] });
      }
      s.advance(FRAME);
    }
    return s;
  }
  for (const level of [1, 2])
    for (const n of [2, 4, 8]) {
      it(`level ${level} with ${n} bots`, () => {
        const s = play(level, n, 'free', 120);
        expect(s.world.status).toBe('cleared');
        expect(s.world.result!.timeSec).toBeLessThan(LEVELS[level - 1]!.parSec * 1.5); // at least a silver
        expect(s.world.players.every((p) => p.inGoal)).toBe(true);
      }, 60_000);
    }
  it('a level that needs the whole group fails if one explorer stays at the start (the goal counts everybody connected)', () => {
    const s = new ObstSession({ mode: 'free', difficulty: 'normal', level: 0, seed: 1, slots: [0, 1, 2], levels: [LEVELS[0]!] });
    const bots = [new ObstBot(0), new ObstBot(1)]; // slot 2 never moves
    const taps = [
      [0, 0],
      [0, 0],
    ];
    for (let f = 0; f < 60 * 60; f++) {
      const snap = snapshot(s.world);
      const view = { tick: s.world.tick, grid: s.world.grid, players: snap.players, goal: snap.goal };
      bots.forEach((b, i) => {
        const o = b.decide(view);
        if (o.jump) taps[i]![0]!++;
        if (o.grab) taps[i]![1]!++;
        s.receive(i, { x: o.x, y: o.y, presses: [taps[i]![0]!, taps[i]![1]!] });
      });
      s.advance(FRAME);
    }
    expect(s.world.status).toBe('playing');
    expect(s.world.players[2]!.inGoal).toBe(false);
  }, 60_000);
});

describe('constants the screen relies on', () => {
  it('the expedition is three levels and a step is 1/60 s', () => {
    expect(EXPEDITION_LEVELS).toBe(3);
    expect(DT * 1000).toBeCloseTo(STEP_MS, 9);
  });
});
