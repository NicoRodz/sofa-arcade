// The Manchazo round running on this screen, fed by the phones' packets: the latest stick of each phone, button 1 (a counter that grew = one pinata) and button 2 (the sabotage in hand).
import { mapSeedFor } from '../../map';
import { toMilli, type ControlPlan } from '../../sim';
import { Feed } from './hud/feed';
import { createManchazo, stepManchazo, type ManchazoInput, type ManchazoState } from '../../sim';

export const MATCH_STEP_MS = 1000 / 60;
export const MATCH_OVER_MS = 4500; // the final board stays on the field this long before the results

interface Pad {
  sx: number;
  sy: number;
  seen: readonly number[]; // presses counters at the last packet
  drop: boolean; // a press arrived since the last tick
  use: boolean; // same for button 2
}

export class ManchazoRun {
  readonly state: ManchazoState;
  readonly feed = new Feed(); // PR1: what the TV announces (sabotages played, score swings), read from the state after each tick
  private pads = new Map<number, Pad>();
  private acc = 0;
  private overFor = 0;

  constructor(slots: readonly number[], teams: readonly number[], seed: number, mapSeed: number, control?: ControlPlan) {
    this.state = createManchazo({
      slots,
      teams,
      seed,
      mapSeed,
      sabotage: true,
      sabotagePlus: true, // F8a: the five new sabotages are in the deck (the sim without the flag is F5's)
      sabotageV2: true, // PR6: the Sponge soaks and squeezes a diamond (and bursts if you are stained loaded); the Tape is a 5-tile line that cuts blasts (the sim without the flag is PR4's)
      events: true,
      projectiles: true, // PR4: Pegote, Cambiazo and Mareo are aimed, thrown and dodged; a Pegote can be passed (the sim without the flag is PR3's)
      rescue: true, // PR3: a teammate next to a stained body frees it after 12 ticks; a stained body drops its card (the sim without the flag is PR2's)
      phases: true, // PR2: Opening, Scramble and Final (the sim without the flag is F8b's)
      eventsPlus: true, // F8b: the five new events are in the pool (the sim without the flag is F8a's)
      living: true,
      ...(control ? { control } : {}),
    });
  }

  /** The latest packet of a phone: x and y in [-1, 1] (integer milli units from here on) and its presses counters. The first packet is only a baseline. */
  receive(slot: number, x: number, y: number, presses: readonly number[]) {
    const p = this.pads.get(slot) ?? { sx: 0, sy: 0, seen: presses, drop: false, use: false };
    p.sx = toMilli(x);
    p.sy = toMilli(y);
    if (presses[0] !== p.seen[0]) p.drop = true;
    if (presses[1] !== p.seen[1]) p.use = true;
    p.seen = presses;
    this.pads.set(slot, p);
  }

  /** Advances by a frame's time in fixed 60 Hz ticks. Returns true once, when the final board has been shown long enough. */
  advance(deltaMs: number): boolean {
    const g = this.state.grid;
    if (g.over) {
      this.overFor += deltaMs;
      return this.overFor - deltaMs < MATCH_OVER_MS && this.overFor >= MATCH_OVER_MS;
    }
    this.acc = Math.min(this.acc + deltaMs, MATCH_STEP_MS * 6); // a stalled tab does not fast-forward the round
    while (this.acc + 1e-9 >= MATCH_STEP_MS && !g.over) {
      const inputs = new Map<number, ManchazoInput>();
      for (const [slot, p] of this.pads) {
        inputs.set(slot, { sx: p.sx, sy: p.sy, drop: p.drop, use: p.use });
        p.drop = false;
        p.use = false;
      }
      stepManchazo(this.state, inputs);
      this.feed.observe(this.state);
      this.acc -= MATCH_STEP_MS;
    }
    return false;
  }
}

export const matchRun: { run: ManchazoRun | null; rounds: number; forced: number | null } = { run: null, rounds: 0, forced: null };

/** The map seed of the round about to start: a new one every round (the next draw of the lobby seed's substream). `matchRun.forced` (capture tool) wins once. */
export function nextMapSeed(lobbySeed: number): number {
  const seed = matchRun.forced ?? mapSeedFor(lobbySeed, matchRun.rounds);
  matchRun.forced = null;
  matchRun.rounds++;
  return seed;
}
