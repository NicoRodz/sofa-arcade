// Which file each cue of the HUD (hud/cues.ts) plays. The suite has no sound of its own for every cue, so the rest go to the nearest one:
//   sab-* (the ten sabotages)  -> sabotage-use   (one zap for all: the icon over the body says which)
//   score-swing                -> pickup         (a short rising sparkle, at 60 %: it is good news for a team, not an alarm)
//   phase-warn / -scramble / -final -> event-alert (a change of act is an announcement like an event; the stinger is kept for "¡TIEMPO EXTRA!")
import { PHASE_CUES, SABOTAGE_CUES, SWING_CUE } from '../match/hud/cues';
import type { AudioFile } from './files';

export interface CueSound {
  file: AudioFile;
  gain: number;
}

const ZAP: CueSound = { file: 'sabotage-use', gain: 1 };
const SPARKLE: CueSound = { file: 'pickup', gain: 0.6 };
const ALERT: CueSound = { file: 'event-alert', gain: 1 };

/** The sound of a cue, or null for a cue id this table does not know (a new cue without its line here). */
export function soundOfCue(cue: string): CueSound | null {
  if (cue === SWING_CUE) return SPARKLE;
  if (Object.values(PHASE_CUES).includes(cue as never)) return ALERT;
  if (Object.values(SABOTAGE_CUES).includes(cue)) return ZAP;
  return null;
}

/** Every cue id the HUD can emit (for the tests: each one must have a file). */
export const allCues = (): string[] => [...Object.values(SABOTAGE_CUES), SWING_CUE, ...Object.values(PHASE_CUES)];
