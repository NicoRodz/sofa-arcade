// The TV's own event log for the couch HUD, derived from the sim's state after each tick (the sim has no bus yet and this PR does not touch it): which body played which
// sabotage, and when a team's share of the floor jumped. Pure data and read-only: it never writes the state and draws nothing, so the sim's hashes cannot move.
// The ManchazoRun feeds it once per 60 Hz tick (`observe`); the scene, a future audio layer and the tests read `log` / `fresh`.
import { isHidden, shownCounts, type ManchazoState, type SabotageKind } from '../../../sim';

export const SWING_PP = 1.5; // a team gaining this many percentage points ...
export const SWING_WINDOW = 60; // ... within this many ticks is a swing
export const SWING_COOL = 60; // and the same team does not announce another one for this long

export type FeedEvent =
  | { type: 'fired'; tick: number; body: number; slot: number; team: number; kind: SabotageKind }
  | { type: 'swing'; tick: number; team: number; pp: number };

const pct = (s: ManchazoState): number[] => {
  const c = shownCounts(s);
  return [0, 1].map((t) => (s.match.paintable > 0 ? (100 * c[t]!) / s.match.paintable : 0));
};

export class Feed {
  readonly log: FeedEvent[] = [];
  private used = -1; // sabotages played so far (-1: no baseline yet)
  private held: (SabotageKind | null)[] = [];
  private sponge: number[] = [];
  private hist: number[][] = []; // the last SWING_WINDOW + 1 shares, oldest first
  private lastSwing = [-1e9, -1e9];
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
      this.used = a.used;
      this.held = [...a.held];
      this.sponge = [...sponge];
    }
    if (isHidden(s)) return void (this.hist = []); // the last 10 s are played blind: no swing may leak the score
    const now = pct(s);
    this.hist.push(now);
    if (this.hist.length > SWING_WINDOW + 1) this.hist.shift();
    for (const team of [0, 1]) {
      const gain = now[team]! - Math.min(...this.hist.map((h) => h[team]!));
      if (gain >= SWING_PP && tick - this.lastSwing[team]! >= SWING_COOL) {
        this.lastSwing[team] = tick;
        this.log.push({ type: 'swing', tick, team, pp: gain });
      }
    }
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
    mix(e.type === 'fired' ? 1 : 2);
    mix(e.tick);
    mix(e.team);
    if (e.type === 'fired') [e.body, e.slot, e.kind.length, e.kind.charCodeAt(0), e.kind.charCodeAt(1)].forEach(mix);
    else mix(Math.round(e.pp * 100));
  }
  return h;
}
