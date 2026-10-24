// Pure voice limiting for the game's sfx (plan §14: at most 24 voices). Bus levels, compressor and soft-clip are the
// shared chain of screen/src/audio (createChain); this file only decides which cues are let through.
import { cueDuration, type Cue } from './recipes';

export const MAX_VOICES = 24;
export const DUPLICATE_S = 0.04; // the same key inside this window is dropped
export const RESERVE_STEP = 3; // each priority level below 3 gives up this many voices to the ones above
export const PER_RECIPE_MAX = 8; // eight players may jump in the same instant, never more of one sound than that
export const KEY_GAP_S: Partial<Record<Cue['recipe'], number>> = { ropeStrain: 0.3, ropeTaut: 0.12 }; // continuous-ish events

/** Voices a cue of this priority may fill: p3 up to 24, p2 up to 21, p1 up to 18, p0 up to 15. */
export const capFor = (priority: Cue['priority']): number => MAX_VOICES - (3 - priority) * RESERVE_STEP;

export class VoiceLimiter {
  private live: { key: string; recipe: Cue['recipe']; start: number; end: number }[] = [];
  private last = new Map<string, number>();
  get size() { return this.live.length; }
  /** True when the cue may play at `now`; records it. */
  allow(c: Cue, now: number): boolean {
    this.live = this.live.filter((v) => v.end > now);
    const gap = KEY_GAP_S[c.recipe] ?? DUPLICATE_S;
    const prev = this.last.get(c.key);
    if (prev !== undefined && now - prev < gap) return false;
    if (this.live.length >= capFor(c.priority)) return false;
    if (this.live.filter((v) => v.recipe === c.recipe).length >= PER_RECIPE_MAX) return false;
    this.last.set(c.key, now);
    this.live.push({ key: c.key, recipe: c.recipe, start: now, end: now + cueDuration(c) });
    return true;
  }
}
