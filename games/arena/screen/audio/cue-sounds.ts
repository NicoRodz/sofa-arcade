// Which file each cue of the HUD (hud/cues.ts) plays. The suite has no sound of its own for every cue, so the rest go to the nearest one:
//   sab-* (the ten sabotages)  -> sabotage-use   (one zap for all: the icon over the body says which)
//   score-swing                -> pickup         (a short rising sparkle, at 60 %: it is good news for a team, not an alarm)
//   rescue-free                -> pickup         (a freed body is good news: the sparkle, at 60 %)
//   loot-drop                  -> event-alert    (a card falls: a soft announcement, at 50 %)   loot-take -> pickup (full; tracker.ts's pickup of the same frame is dropped by the engine's 50 ms gap)
//   loot-expire                -> nothing        (the card goes back to its spawner: not worth a sound)
//   shot-launch                -> nothing        (the card's own `fired` cue (sab-*) plays the zap on the same tick)
//   shot-hit                   -> sabotage-use   (the shot lands: the zap, full)   shot-pass -> sabotage-use (the Pegote jumps, at 80 %)
//   shot-clash                 -> event-alert    (two shots cancel: a soft announcement, at 50 %)
//   shot-miss / shot-cancel    -> nothing        (a shot that ends on a wall, an aim that was cut: no news)
//   wrap-tape                  -> sabotage-use   (the tape lands: the zap, at 60 %)   wrap-squeeze -> pinata-pop (at 70 %)   wrap-burst -> pinata-pop (full: a stain just paid for it)
//   phase-warn / -scramble / -final -> event-alert (a change of act is an announcement like an event; the stinger is kept for "¡TIEMPO EXTRA!")
import { LOOT_CUES, PHASE_CUES, RESCUE_CUE, SABOTAGE_CUES, SHOT_CUES, SWING_CUE, WRAP_CUES } from '../match/hud/cues';
import type { AudioFile } from './files';

export interface CueSound {
  file: AudioFile;
  gain: number;
}

const ZAP: CueSound = { file: 'sabotage-use', gain: 1 };
const SPARKLE: CueSound = { file: 'pickup', gain: 0.6 };
const ALERT: CueSound = { file: 'event-alert', gain: 1 };

const SOFT_ALERT: CueSound = { file: 'event-alert', gain: 0.5 };
const TAKE: CueSound = { file: 'pickup', gain: 1 };

/** Cues that are deliberately silent (listed so the tests can tell them from a cue that was forgotten). */
export const SILENT_CUES: readonly string[] = [LOOT_CUES.expire, SHOT_CUES.launch, SHOT_CUES.miss, SHOT_CUES.cancel];

/** The sound of a cue, or null for a silent cue or a cue id this table does not know (a new cue without its line here: the test fails). */
export function soundOfCue(cue: string): CueSound | null {
  if (cue === RESCUE_CUE) return SPARKLE;
  if (cue === LOOT_CUES.drop) return SOFT_ALERT;
  if (cue === LOOT_CUES.take) return TAKE;
  if (cue === SWING_CUE) return SPARKLE;
  if (cue === SHOT_CUES.hit) return ZAP;
  if (cue === SHOT_CUES.pass) return { ...ZAP, gain: 0.8 };
  if (cue === SHOT_CUES.clash) return SOFT_ALERT;
  if (cue === WRAP_CUES.tape) return { ...ZAP, gain: 0.6 };
  if (cue === WRAP_CUES.squeeze) return { file: 'pinata-pop', gain: 0.7 };
  if (cue === WRAP_CUES.burst) return { file: 'pinata-pop', gain: 1 };
  if (Object.values(PHASE_CUES).includes(cue as never)) return ALERT;
  if (Object.values(SABOTAGE_CUES).includes(cue)) return ZAP;
  return null;
}

/** Every cue id the HUD can emit (for the tests: each one must have a file). */
export const allCues = (): string[] => [
  ...Object.values(SABOTAGE_CUES),
  SWING_CUE,
  ...Object.values(PHASE_CUES),
  RESCUE_CUE,
  ...Object.values(LOOT_CUES),
  ...Object.values(SHOT_CUES),
  ...Object.values(WRAP_CUES),
];
