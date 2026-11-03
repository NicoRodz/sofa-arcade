// The sound cue for each thing the HUD announces: a table of ids and a hook, no audio files (the F8m suite is still in production). When it lands, `setCueSink` gets the
// audio layer's `play` and each cue id names a sample; until then nothing is connected and every cue is dropped.
import type { SabotageKind } from '../../../sim';
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

export const cueOf = (e: FeedEvent): string => (e.type === 'fired' ? SABOTAGE_CUES[e.kind] : SWING_CUE);

type Sink = (cue: string, e: FeedEvent) => void;
let sink: Sink | null = null;

/** Connects the audio layer (null disconnects). */
export const setCueSink = (fn: Sink | null): void => void (sink = fn);

/** Hands the events to the sink, one cue each. */
export function playCues(events: readonly FeedEvent[]): void {
  if (sink) for (const e of events) sink(cueOf(e), e);
}
