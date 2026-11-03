// The sabotage banners as plain data: one pill per team (so never more than 2 on screen), 60 ticks each. When a team has several alive, the one with the biggest swing
// of that team since it was played wins (|Δ pp|, the plan's priority); a tie goes to the newest. No Phaser: the HUD draws it, `hud.test.ts` reads it.
import { SABOTAGES, PLUS_SABOTAGES, type SabotageKind } from '../../../sim';
import type { FeedEvent } from './feed';

export const BANNER_TICKS = 60;
export const ICON_TICKS = 60; // the icon over the player lasts 1 s: long enough to see who to chase, short enough not to hide the neighbours

const NAMES = Object.fromEntries([...SABOTAGES, ...PLUS_SABOTAGES].map((k) => [k.kind, k.name])) as Record<SabotageKind, string>;
export const sabotageName = (kind: SabotageKind): string => NAMES[kind];

export interface Pill {
  team: number;
  text: string; // "AZUL 3 → MAREO"
  kind: SabotageKind;
  age: number; // ticks since it was played
  weight: number; // the biggest swing (pp) of its team since
}

export class Banners {
  private alive: (Pill & { born: number })[] = [];

  constructor(private teamName: (team: number) => string) {}

  /** Takes the events logged since the last call. */
  push(events: readonly FeedEvent[]): void {
    for (const e of events) {
      if (e.type === 'fired')
        this.alive.push({
          team: e.team,
          text: `${this.teamName(e.team).toUpperCase()} ${e.slot + 1} → ${sabotageName(e.kind).toUpperCase()}`,
          kind: e.kind,
          age: 0,
          weight: 0,
          born: e.tick,
        });
      else for (const p of this.alive) if (p.team === e.team && e.tick - p.born < BANNER_TICKS) p.weight = Math.max(p.weight, e.pp);
    }
  }

  /** The pills to draw at `tick`: index = team. */
  visible(tick: number): (Pill | null)[] {
    this.alive = this.alive.filter((p) => tick - p.born < BANNER_TICKS && tick >= p.born);
    return [0, 1].map((t) => {
      const mine = this.alive.filter((p) => p.team === t).map((p) => ({ ...p, age: tick - p.born }));
      mine.sort((a, b) => b.weight - a.weight || a.age - b.age);
      return mine[0] ?? null;
    });
  }
}
