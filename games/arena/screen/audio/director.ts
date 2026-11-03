// Decides what Manchazo plays, frame by frame, from the shell's phase and the sim's state; the Sound (engine.ts) does it. Nothing runs until `sync` is called.
//   lobby: lobby.ogg      round: the three layers, crossfaded by layerOf (layers.ts)      results: win / lose once      one-shots: tracker.ts (state) and cue-sounds.ts (HUD cues)
// Result jingle: a decided round plays win.ogg, a draw plays lose.ogg (the TV has no single "own" team: the draw is the only sad ending).
import type { ManchazoState } from '../../sim';
import { matchResult } from '../../sim';
import { soundOfCue } from './cue-sounds';
import type { Sound } from './engine';
import { layerOf, modeOf, type Mode } from './layers';
import { newTracker, track, type Tracker } from './tracker';

export interface SyncInput {
  state: ManchazoState | null;
  phase: string;
  live: boolean; // the 3-2-1 gate is over
}

export function createDirector(sound: Sound) {
  let mode: Mode = 'off';
  let seen: ManchazoState | null = null;
  let tracker: Tracker | null = null;
  return {
    /** Every frame while Manchazo is the active game. */
    sync({ state, phase, live }: SyncInput): void {
      const next = modeOf({ phase, live, over: !!state?.grid.over, hasRound: !!state });
      sound.loop(next === 'lobby' ? 'lobby' : next === 'round' ? 'round' : null);
      if (next === 'results' && mode !== 'results' && state) sound.play(matchResult(state).winner === null ? 'lose' : 'win');
      mode = next;
      if (!state || next === 'lobby') {
        seen = null;
        tracker = null;
        return;
      }
      if (state !== seen) {
        seen = state; // a new round: its first state is the baseline, nothing in it is news
        tracker = newTracker(state);
      }
      if (next !== 'round') return;
      sound.layer(layerOf(state));
      for (const f of track(tracker!, state)) sound.play(f);
    },
    /** The sink of hud/cues.ts. */
    cue(cue: string): void {
      const s = soundOfCue(cue);
      if (s) sound.play(s.file, s.gain);
    },
  };
}
