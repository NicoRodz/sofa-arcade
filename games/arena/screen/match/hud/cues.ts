// The sound cue for each thing the HUD announces: a table of ids and a hook. `setCueSink` is connected by screen/audio/audio.ts; which file each cue plays is in
// screen/audio/cue-sounds.ts (a new cue needs its line there: its test fails otherwise).
import type { SabotageKind, ShotLogKind, WrapLogKind } from '../../../sim';
import type { FeedEvent } from './feed';

export const SABOTAGE_CUES: Record<SabotageKind, string> = {
  turpentine: 'sab-turpentine',
  roller: 'sab-roller',
  fan: 'sab-fan',
  footprints: 'sab-footprints',
  glue: 'sab-glue',
  tape: 'sab-tape',
  ink: 'sab-ink',
  sponge: 'sab-sponge',
  swap: 'sab-swap',
  dizzy: 'sab-dizzy',
};
export const SWING_CUE = 'score-swing';
// PR2: a change of act. The warning (120 ticks before) and the change itself have their own cue each; the sound layer picks the sample.
export const PHASE_CUES = { warn: 'phase-warn', scramble: 'phase-scramble', final: 'phase-final' } as const;

// PR3: a stained body freed by its team, and the loot's three moments (a card falls, somebody picks it up, nobody does and it goes back to its spawner)
export const RESCUE_CUE = 'rescue-free';
export const LOOT_CUES = { drop: 'loot-drop', take: 'loot-take', expire: 'loot-expire' } as const;

// PR4: the projectiles' six moments (`sab.shot.log`): a shot leaves, hits, ends on a wall or its range, two rival shots cancel, a Pegote is passed, an aim is cut
export const SHOT_CUES: Record<ShotLogKind, string> = {
  launch: 'shot-launch',
  hit: 'shot-hit',
  miss: 'shot-miss',
  clash: 'shot-clash',
  pass: 'shot-pass',
  cancel: 'shot-cancel',
};

// PR6: the packing tape lands, a sponge is squeezed, a loaded sponge bursts (the card's own `fired` cue plays at the press)
export const WRAP_CUES: Record<WrapLogKind, string> = { tape: 'wrap-tape', squeeze: 'wrap-squeeze', burst: 'wrap-burst' };

export const cueOf = (e: FeedEvent): string =>
  e.type === 'fired'
    ? SABOTAGE_CUES[e.kind]
    : e.type === 'swing'
      ? SWING_CUE
      : e.type === 'rescue'
        ? RESCUE_CUE
        : e.type === 'loot'
          ? LOOT_CUES[e.what]
          : e.type === 'shot'
            ? SHOT_CUES[e.what]
            : e.type === 'wrap'
              ? WRAP_CUES[e.what]
              : e.warn
                ? PHASE_CUES.warn
                : PHASE_CUES[e.phase];

type Sink = (cue: string, e: FeedEvent) => void;
let sink: Sink | null = null;

/** Connects the audio layer (null disconnects). */
export const setCueSink = (fn: Sink | null): void => void (sink = fn);

/** Hands the events to the sink, one cue each. */
export function playCues(events: readonly FeedEvent[]): void {
  if (sink) for (const e of events) sink(cueOf(e), e);
}
