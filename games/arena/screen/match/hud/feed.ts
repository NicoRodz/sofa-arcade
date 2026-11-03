// The TV's own event log for the couch HUD, derived from the sim's state after each tick (the sim has no bus yet and this PR does not touch it): which body played which
// sabotage, and when a team's share of the floor jumped. Pure data and read-only: it never writes the state and draws nothing, so the sim's hashes cannot move.
// The ManchazoRun feeds it once per 60 Hz tick (`observe`); the scene, a future audio layer and the tests read `log` / `fresh`.
import {
  WRAP_LOG_KINDS,
  isHidden,
  shownCounts,
  type ManchazoState,
  type SabotageKind,
  type ShotLogKind,
  type WrapLogKind,
} from '../../../sim';

export const SWING_PP = 1.5; // a team gaining this many percentage points ...
export const SWING_WINDOW = 60; // ... within this many ticks is a swing
export const SWING_COOL = 60; // and the same team does not announce another one for this long
export const RECENT_WINDOW = 120; // the "+X %" on screen is what the team gained over the last 2 s: never since the start of the round

/** A hand that filled up: a pickup walked over, or a dropped card picked up. Kept apart from `log` so the log, its hash and the sound cues stay as they were. */
export interface GrabEvent {
  tick: number;
  body: number;
  slot: number;
  team: number;
  kind: SabotageKind;
}

export type FeedEvent =
  | { type: 'fired'; tick: number; body: number; slot: number; team: number; kind: SabotageKind }
  | { type: 'swing'; tick: number; team: number; pp: number }
  | { type: 'phase'; tick: number; phase: 'scramble' | 'final'; warn: boolean } // PR2: a change of act announced (warn: 120 ticks before it)
  | { type: 'rescue'; tick: number; body: number; slot: number; team: number } // PR3: `body` was freed by its team
  | { type: 'loot'; tick: number; body: number; slot: number; team: number; what: 'drop' | 'take' | 'expire'; kind: SabotageKind } // PR3: a card fell / was picked up by `body` / went back
  | { type: 'wrap'; tick: number; body: number; slot: number; team: number; what: WrapLogKind } // PR6: a tape landed, a sponge was squeezed, a loaded sponge burst (the sim's `wrap.log`)
  | { type: 'shot'; tick: number; body: number; slot: number; team: number; what: ShotLogKind; kind: SabotageKind }; // PR4: what the projectiles did (the sim's `sab.shot.log`); `body` is the shooter (for a pass: whoever passed the Pegote)

const PHASE_LOG = {
  warnScramble: ['scramble', true],
  phaseScramble: ['scramble', false],
  warnFinal: ['final', true],
  phaseFinal: ['final', false],
} as const;

const pct = (s: ManchazoState): number[] => {
  const c = shownCounts(s);
  return [0, 1].map((t) => (s.match.paintable > 0 ? (100 * c[t]!) / s.match.paintable : 0));
};

export class Feed {
  readonly log: FeedEvent[] = [];
  readonly grabs: GrabEvent[] = []; // the top feed's "tomó" (top-feed.ts)
  private primed = false; // the first observation only learns the hands: a card already held at the start was not taken just now
  private used = -1; // sabotages played so far (-1: no baseline yet)
  private held: (SabotageKind | null)[] = [];
  private sponge: number[] = [];
  private hist: number[][] = []; // the last RECENT_WINDOW + 1 shares, oldest first
  private lastSwing = [-1e9, -1e9];
  private seenLog = 0; // entries of the sim's announcement log already read
  private seenRes = 0; // same for the rescue and loot log (PR3)
  private seenShot = 0; // same for the projectiles' log (PR4)
  private seenWrap = 0; // same for the packing tape and the sponge v2 (PR6)
  private sink = 0; // log entries already handed out by `fresh`

  /** Call after every tick of the round. */
  observe(s: ManchazoState): void {
    const tick = s.grid.tick;
    const a = s.match.sab;
    if (a) {
      const sponge = a.plus?.sponge ?? [];
      if (this.used >= 0 && a.used > this.used) {
        let left = a.used - this.used; // a card timing out (the sponge) empties a hand without playing: only a played card moves `used`
        s.grid.bodies.forEach((b, body) => {
          const was = this.held[body] ?? null;
          const kind = was && a.held[body] === null ? was : (this.sponge[body] ?? 0) === 0 && (sponge[body] ?? 0) > 0 ? a.held[body] : null;
          if (kind && left > 0) {
            left--;
            this.log.push({ type: 'fired', tick, body, slot: b.slot, team: b.team, kind });
          }
        });
      }
      if (this.primed)
        s.grid.bodies.forEach((b, body) => {
          const now = a.held[body] ?? null;
          if (now && (this.held[body] ?? null) === null) this.grabs.push({ tick, body, slot: b.slot, team: b.team, kind: now });
        });
      this.primed = true;
      this.used = a.used;
      this.held = [...a.held];
      this.sponge = [...sponge];
    }
    const ann = s.match.ev?.log ?? [];
    for (; this.seenLog < ann.length; this.seenLog++) {
      const a = ann[this.seenLog]!;
      if (a.kind in PHASE_LOG) {
        const [phase, warn] = PHASE_LOG[a.kind as keyof typeof PHASE_LOG];
        this.log.push({ type: 'phase', tick: a.tick, phase, warn });
      }
    }
    const rl = s.match.res?.log ?? [];
    for (; this.seenRes < rl.length; this.seenRes++) {
      const e = rl[this.seenRes]!;
      const b = s.grid.bodies[e.body]!;
      const who = { tick: e.tick, body: e.body, slot: b.slot, team: b.team };
      if (e.kind === 'rescue') this.log.push({ type: 'rescue', ...who });
      else if (e.card) this.log.push({ type: 'loot', ...who, what: e.kind, kind: e.card });
    }
    const sl = s.match.sab?.shot?.log ?? [];
    for (; this.seenShot < sl.length; this.seenShot++) {
      const e = sl[this.seenShot]!;
      const b = s.grid.bodies[e.body]!;
      this.log.push({ type: 'shot', tick: e.tick, body: e.body, slot: b.slot, team: b.team, what: e.kind, kind: e.card });
    }
    const wl = s.match.sab?.plus?.wrap?.log ?? [];
    for (; this.seenWrap < wl.length; this.seenWrap++) {
      const e = wl[this.seenWrap]!;
      const b = s.grid.bodies[e.body]!;
      this.log.push({ type: 'wrap', tick: e.tick, body: e.body, slot: b.slot, team: b.team, what: e.kind });
    }
    if (isHidden(s)) return void (this.hist = []); // the last 10 s are played blind: no swing may leak the score
    const now = pct(s);
    this.hist.push(now);
    if (this.hist.length > RECENT_WINDOW + 1) this.hist.shift();
    for (const team of [0, 1]) {
      const gain = this.gain(team, SWING_WINDOW);
      if (gain >= SWING_PP && tick - this.lastSwing[team]! >= SWING_COOL) {
        this.lastSwing[team] = tick;
        this.log.push({ type: 'swing', tick, team, pp: gain });
      }
    }
  }

  /** What `team` gained (pp) over the last `window` ticks: its share now minus its lowest share inside that window. 0 with no history (the round just began, or the score is hidden). */
  gain(team: number, window: number = RECENT_WINDOW): number {
    const w = this.hist.slice(-(window + 1)).map((h) => h[team]!);
    return w.length ? w[w.length - 1]! - Math.min(...w) : 0;
  }

  /** The events logged since the last call (what a sink such as the audio layer plays once each). */
  fresh(): readonly FeedEvent[] {
    const out = this.log.slice(this.sink);
    this.sink = this.log.length;
    return out;
  }
}

/** A 32-bit hash of the log (FNV-1a over its fields), for the replay test: the same seed and inputs give the same number. */
export function feedHash(log: readonly FeedEvent[]): number {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    h = Math.imul(h ^ (n | 0), 0x01000193) >>> 0;
  };
  for (const e of log) {
    mix(
      e.type === 'fired'
        ? 1
        : e.type === 'swing'
          ? 2
          : e.type === 'phase'
            ? 3
            : e.type === 'rescue'
              ? 4
              : e.type === 'loot'
                ? 5
                : e.type === 'wrap'
                  ? 7
                  : 6,
    );
    mix(e.tick);
    if (e.type === 'phase') {
      mix(e.phase === 'final' ? 1 : 0);
      mix(e.warn ? 1 : 0);
      continue;
    }
    mix(e.team);
    if (e.type === 'fired') [e.body, e.slot, e.kind.length, e.kind.charCodeAt(0), e.kind.charCodeAt(1)].forEach(mix);
    else if (e.type === 'rescue') [e.body, e.slot].forEach(mix);
    else if (e.type === 'wrap') [e.body, e.slot, WRAP_LOG_KINDS.indexOf(e.what)].forEach(mix);
    else if (e.type === 'shot')
      [e.body, e.slot, e.what.length, e.what.charCodeAt(0), e.what.charCodeAt(1), e.kind.charCodeAt(0), e.kind.charCodeAt(1)].forEach(mix);
    else if (e.type === 'loot')
      [e.body, e.slot, e.what.length, e.what.charCodeAt(0), e.kind.charCodeAt(0), e.kind.charCodeAt(1)].forEach(mix);
    else mix(Math.round(e.pp * 100));
  }
  return h;
}
