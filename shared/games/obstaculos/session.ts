// The expedition as the screen runs it (F3): the world of F2a stepped at a fixed 60 Hz from the LAST input of every phone, the three levels
// of a run, the pauses between them and the results. Pure and deterministic (the clock is the simulation's own, never Date.now()), so the
// bots and the tests run it in Node exactly like the screen does.
//
//   const s = new ObstSession({ mode, difficulty, level, seed, slots })
//   s.receive(slot, { x, y, presses }, ...)     every packet of a phone (the tracker keeps the latest stick and counts the presses)
//   events = s.advance(dtMs)                    once per render frame: steps the world 0..4 times, returns the obst.* events to publish
//   s.setConnected(slot, on) / s.setOffCamera(flags)
//   s.status: 'countdown' | 'playing' | 'between' | 'over'    s.summary() when 'over'
import type { Difficulty } from '../../difficulty';
import { DT, EXPEDITION_LEVELS, MAX_STEPS_PER_FRAME, STEP_MS } from './constants';
import { generateLevel } from './generate';
import { fixedExpedition, RANDOM_LEVEL } from './lobby';
import { InputTracker, type Packet, type PlayerStep } from './sim/input';
import { advanceRun, awardsOf, newRun, type Awards, type RunState } from './sim/rules';
import { SLOT_COUNT } from './sim/tuning';
import type { ObstEvent, PlayerStats, World } from './sim/state';
import { createWorld, setConnected, step } from './sim/world';
import type { GameMode, LevelDef } from './types';

export const COUNTDOWN_MS = 3000; // 3-2-1 before the first level
export const NEXT_COUNTDOWN_MS = 2000; // before the following ones
export const BETWEEN_MS = 4200; // "NIVEL COMPLETADO" stays this long before the next level (or the end of the run)
export const OVER_HOLD_MS = 3600; // the final banner stays this long before the results
export const IDLE_INPUT: PlayerStep = { move: 0, down: false, jump: false, up: false, grab: false };

export type SessionStatus = 'countdown' | 'playing' | 'between' | 'over';

export interface SessionOpts {
  mode: GameMode;
  difficulty: Difficulty;
  level: number; // RANDOM_LEVEL (0) or 1..15
  seed: number;
  slots: readonly number[]; // connected phones at the start
  p90LatencyMs?: number;
  levels?: readonly LevelDef[]; // tests and tools: an explicit list of levels (skips the lobby's choice)
}

export interface LevelSummary {
  id: string; name: string; biome: LevelDef['biome']; index: number;
  cleared: boolean; // false: the lives ran out
  retry: boolean; // played again after running out of lives (score x0.5)
  timeSec: number; parSec: number; medal: 'gold' | 'silver' | 'bronze' | null;
  stars: number; starsMax: number; // the collectible stars
  deaths: number; livesLeft: number; // Infinity when unlimited
  checkpoints: number; checkpointsMax: number;
  score: number; // what this level added to the run
}
export interface RunSummary {
  reason: 'complete' | 'failed';
  score: number;
  levels: LevelSummary[];
  expedition: number; // levels in the expedition (3, or fewer when it starts near the end of the list)
  cleared: number;
  awards: Awards;
  mode: GameMode; difficulty: Difficulty; random: boolean; seed: number;
  totals: { deaths: number; stars: number; starsMax: number; timeSec: number };
}

const sumStats = (a: PlayerStats, b: PlayerStats): PlayerStats => ({
  deaths: a.deaths + b.deaths, stars: a.stars + b.stars, anchoredSteps: a.anchoredSteps + b.anchoredSteps, throws: a.throws + b.throws, catches: a.catches + b.catches, offCameraSteps: a.offCameraSteps + b.offCameraSteps,
});
const zeroStats = (): PlayerStats => ({ deaths: 0, stars: 0, anchoredSteps: 0, throws: 0, catches: 0, offCameraSteps: 0 });

export class ObstSession {
  readonly levels: LevelDef[];
  readonly opts: SessionOpts;
  readonly run: RunState = newRun();
  readonly summaries: LevelSummary[] = [];
  world: World;
  status: SessionStatus = 'countdown';
  countdownMs = COUNTDOWN_MS;
  betweenMs = 0;
  overMs = 0;
  alpha = 0; // how far the render frame is between the previous and the current step
  clockMs = 0; // simulation clock, advances on every step of any status
  steps = 0; // total steps of the session
  prev: { x: number; y: number }[] = []; // body position (hitbox top-left) before the latest step, by slot
  readonly connected = new Set<number>();
  private trackers: InputTracker[] = Array.from({ length: SLOT_COUNT }, () => new InputTracker());
  private acc = 0;
  private off: boolean[] | undefined;
  private levelStats: Map<number, PlayerStats> = new Map();

  constructor(opts: SessionOpts) {
    this.opts = opts;
    for (const s of opts.slots) this.connected.add(s);
    this.levels = opts.levels ? [...opts.levels] : planExpedition(opts, Math.max(2, opts.slots.length));
    if (!this.levels.length) throw new Error('no level to play');
    this.world = this.build(0);
  }

  get levelIndex(): number { return this.run.index; }
  get levelCount(): number { return this.levels.length; }
  get over(): boolean { return this.status === 'over'; }
  get overDue(): boolean { return this.status === 'over' && this.overMs >= OVER_HOLD_MS; } // the screen switches to the results now
  get connectedSlots(): number[] { return [...this.connected].sort((a, b) => a - b); }

  private build(index: number): World {
    const w = createWorld({ level: this.levels[Math.min(index, this.levels.length - 1)]!, mode: this.opts.mode, difficulty: this.opts.difficulty, slots: this.connectedSlots, p90LatencyMs: this.opts.p90LatencyMs });
    this.prev = Array.from({ length: SLOT_COUNT }, () => ({ x: 0, y: 0 }));
    for (const p of w.players) this.prev[p.slot] = { x: p.body.x, y: p.body.y };
    return w;
  }

  // A packet of a phone. Presses are the phone's monotonic counters, so a tap between two steps is never lost.
  receive(slot: number, p: Packet): void {
    const t = this.trackers[slot];
    if (t) t.receive(p, this.clockMs);
  }

  setConnected(slot: number, on: boolean): void {
    if (slot < 0 || slot >= SLOT_COUNT) return;
    if (on) this.connected.add(slot); else this.connected.delete(slot);
    if (!on) this.trackers[slot]!.reset();
    if (this.status === 'playing' || this.status === 'countdown' || this.status === 'between') setConnected(this.world, slot, on);
  }

  // Slots the camera shows out of the picture this frame (drives the bubble). Optional: without a camera nobody goes off.
  setOffCamera(flags: readonly boolean[] | undefined): void { this.off = flags ? [...flags] : undefined; }

  advance(dtMs: number): ObstEvent[] {
    const out: ObstEvent[] = [];
    this.acc += Math.min(dtMs, MAX_STEPS_PER_FRAME * STEP_MS);
    let n = 0;
    while (this.acc >= STEP_MS - 1e-6 && n < MAX_STEPS_PER_FRAME) { // the epsilon: 4 x 16.67 ms must be 4 steps, not 3 and a crumb
      this.acc -= STEP_MS;
      n++;
      this.tick(out);
    }
    this.alpha = Math.min(1, this.acc / STEP_MS);
    return out;
  }

  private inputs(): PlayerStep[] {
    const inputs: PlayerStep[] = [];
    for (const p of this.world.players) inputs[p.slot] = this.trackers[p.slot]!.step(this.clockMs);
    return inputs;
  }

  private tick(out: ObstEvent[]): void {
    this.clockMs += STEP_MS;
    this.steps++;
    if (this.status === 'over') { this.overMs += STEP_MS; return; }
    if (this.status === 'countdown') {
      for (const t of this.trackers) t.step(this.clockMs); // taps made during the 3-2-1 do not jump at the start
      this.countdownMs -= STEP_MS;
      if (this.countdownMs <= 0) { this.countdownMs = 0; this.status = 'playing'; }
      return;
    }
    if (this.status === 'between') {
      this.betweenMs -= STEP_MS;
      if (this.betweenMs <= 0) this.afterPause(out);
      return;
    }
    // playing: with nobody connected the clock waits (a screen with every phone dropped must not lose lives)
    if (!this.world.players.some((p) => p.connected)) return;
    for (const p of this.world.players) this.prev[p.slot] = { x: p.body.x, y: p.body.y };
    const ev = step(this.world, this.inputs(), { offCamera: this.off });
    out.push(...ev);
    if (this.world.status !== 'playing') this.finishLevel();
  }

  private finishLevel(): void {
    const w = this.world;
    const before = this.run.score;
    const cleared = w.status === 'cleared' && !!w.result;
    const retry = this.run.retrying;
    const stats = this.statsOf(w);
    for (const [slot, st] of stats) this.levelStats.set(slot, sumStats(this.levelStats.get(slot) ?? zeroStats(), st));
    this.summaries.push({
      id: w.level.def.id, name: w.level.def.name, biome: w.level.def.biome, index: this.run.index, cleared, retry,
      timeSec: cleared ? w.result!.timeSec : w.tick * DT, parSec: w.level.def.parSec, medal: cleared ? w.result!.medal : null,
      stars: w.ent.stars.filter((s) => s.taken).length, starsMax: w.ent.stars.length, deaths: w.deaths, livesLeft: w.lives,
      checkpoints: w.ent.checkpoints.filter((c) => c.activated).length, checkpointsMax: w.ent.checkpoints.length, score: 0,
    });
    this.pendingScore = before;
    this.status = 'between';
    this.betweenMs = BETWEEN_MS;
  }
  private pendingScore = 0;

  private statsOf(w: World): Map<number, PlayerStats> {
    const m = new Map<number, PlayerStats>();
    for (const p of w.players) if (p.connected || p.stats.deaths || p.stats.stars) m.set(p.slot, { ...p.stats });
    return m;
  }

  // The pause ended: the run takes the level's result (score, retry, end of the expedition) and the next world starts, or the run is over.
  private afterPause(out: ObstEvent[]): void {
    const ev = advanceRun(this.run, this.world);
    this.summaries[this.summaries.length - 1]!.score = this.run.score - this.pendingScore;
    out.push(...ev);
    if (!this.run.ended && this.run.index >= this.levels.length) { // a shorter expedition (it started near the end of the list)
      this.run.ended = 'complete';
      out.push({ name: 'obst.runEnd', data: { score: this.run.score, levels: this.run.cleared, reason: 'complete' } });
    }
    if (this.run.ended) { this.status = 'over'; this.overMs = 0; return; }
    this.world = this.build(this.run.index);
    this.status = 'countdown';
    this.countdownMs = NEXT_COUNTDOWN_MS;
    for (const t of this.trackers) t.step(this.clockMs);
  }

  // Seconds of the whole run on the clock of the levels (pauses excluded).
  get timeSec(): number { return this.summaries.reduce((a, s) => a + s.timeSec, 0) + (this.status === 'playing' ? this.world.tick * DT : 0); }

  summary(): RunSummary | null {
    if (!this.run.ended) return null;
    const list = [...this.levelStats.entries()].map(([slot, stats]) => ({ slot, stats }));
    return {
      reason: this.run.ended, score: this.run.score, levels: this.summaries.map((s) => ({ ...s })), expedition: this.levels.length, cleared: this.run.cleared, awards: awardsOf(list),
      mode: this.opts.mode, difficulty: this.opts.difficulty, random: this.opts.level === RANDOM_LEVEL && !this.opts.levels, seed: this.opts.seed,
      totals: {
        deaths: this.summaries.reduce((a, s) => a + s.deaths, 0), stars: this.summaries.reduce((a, s) => a + s.stars, 0), starsMax: this.summaries.reduce((a, s) => a + s.starsMax, 0),
        timeSec: this.summaries.reduce((a, s) => a + s.timeSec, 0),
      },
    };
  }
}

// The three levels of an expedition: from the lobby's level (the next compatible ones), or generated from seeds s, s+1 and s+2 (plan §12).
export function planExpedition(o: Pick<SessionOpts, 'mode' | 'difficulty' | 'level' | 'seed'>, n: number): LevelDef[] {
  if (o.level !== RANDOM_LEVEL) {
    const fixed = fixedExpedition(o.level, n, o.mode);
    if (fixed.length) return fixed;
  }
  return Array.from({ length: EXPEDITION_LEVELS }, (_, i) => generateLevel({ seed: (o.seed + i) >>> 0, n, tether: o.mode === 'chain' ? 'chainOnly' : 'freeOnly', difficulty: o.difficulty }).level);
}
