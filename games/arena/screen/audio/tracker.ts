// The sounds that have no cue: read from the state after each frame by comparing it with the last one (the sim has no bus). Pure data, read-only.
//   a new pinata -> pinata-fuse     a pinata gone -> pinata-pop     a body that was not stained and now is -> stained
//   a hand that was empty and now holds a sabotage -> pickup     a new announcement of the event log -> event-alert ("overtime" -> the TIEMPO EXTRA stinger)
// A change of act is also in that log, but it has its own cue (hud/cues.ts), so it is skipped here. One sound per kind per call: a chain of pinatas is one pop.
import type { AudioFile } from './files';

export interface Watched {
  grid: { bodies: readonly unknown[] };
  match: {
    pinatas: readonly { id: number }[];
    bodies: readonly { stun: number }[];
    sab: { held: readonly (string | null)[] } | null;
    ev: { log: readonly { kind: string }[] } | null;
  };
}
export interface Tracker {
  ids: Set<number>;
  stained: boolean[];
  held: boolean[];
  logSeen: number;
}
export const newTracker = (s: Watched): Tracker => ({
  ids: new Set(s.match.pinatas.map((p) => p.id)),
  stained: s.match.bodies.map((b) => b.stun > 0),
  held: (s.match.sab?.held ?? []).map((h) => h !== null),
  logSeen: s.match.ev?.log.length ?? 0,
});

const PHASE_KINDS = new Set(['warnScramble', 'phaseScramble', 'warnFinal', 'phaseFinal']);

/** The files to play for what changed since `t` (which is updated). */
export function track(t: Tracker, s: Watched): AudioFile[] {
  const out = new Set<AudioFile>();
  const now = new Set(s.match.pinatas.map((p) => p.id));
  for (const id of now) if (!t.ids.has(id)) out.add('pinata-fuse');
  for (const id of t.ids) if (!now.has(id)) out.add('pinata-pop');
  t.ids = now;
  s.match.bodies.forEach((b, i) => {
    const on = b.stun > 0;
    if (on && !t.stained[i]) out.add('stained');
    t.stained[i] = on;
  });
  (s.match.sab?.held ?? []).forEach((h, i) => {
    const on = h !== null;
    if (on && !t.held[i]) out.add('pickup');
    t.held[i] = on;
  });
  const log = s.match.ev?.log ?? [];
  for (; t.logSeen < log.length; t.logSeen++) {
    const kind = log[t.logSeen]!.kind;
    if (kind === 'overtime') out.add('stinger-tiempo-extra');
    else if (!PHASE_KINDS.has(kind)) out.add('event-alert');
  }
  return [...out];
}
