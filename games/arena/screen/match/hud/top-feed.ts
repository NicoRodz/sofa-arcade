// The top feed as plain data (replaces PR1's pills): the newest thing each team took or used, alive for ENTRY_TICKS. "Nico tomó el Ventilador · sopla las piñatas lejos de ti".
// Stateless: it reads the TV's feed (feed.ts: `log` for what was used, `grabs` for what was taken) and the clock, so nothing here can touch the sim. No Phaser: fx draws it.
import type { SabotageKind } from '../../../sim';
import type { Feed } from './feed';
import { LEGENDS } from './legends';

export const ENTRY_TICKS = 240; // 4 s
export const ENTRY_IN = 8; // ticks of slide-in
export const ENTRY_OUT = 20; // ticks of fade-out
export const NAME_MAX = 10; // a longer name is cut: the line has to fit its row

export interface Entry {
  team: number;
  slot: number;
  kind: SabotageKind;
  verb: 'tomó' | 'usó';
  age: number; // ticks since it happened
  who: string; // "Nico tomó el Ventilador"
  legend: string; // "sopla las piñatas lejos de ti"
}

const clip = (name: string): string => (name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name);

/** The entry to show at `tick` for each team (index = team), or null. The newest of the team wins; at the same tick, playing a card wins over taking it. */
export function topFeed(feed: Pick<Feed, 'log' | 'grabs'>, tick: number, name: (slot: number) => string): (Entry | null)[] {
  const best: ({ tick: number; used: boolean; slot: number; kind: SabotageKind } | null)[] = [null, null];
  const offer = (team: number, e: { tick: number; slot: number; kind: SabotageKind }, used: boolean) => {
    const age = tick - e.tick;
    if (age < 0 || age >= ENTRY_TICKS || team < 0 || team > 1) return;
    const cur = best[team];
    if (!cur || e.tick > cur.tick || (e.tick === cur.tick && used && !cur.used))
      best[team] = { tick: e.tick, used, slot: e.slot, kind: e.kind };
  };
  for (const e of feed.grabs) offer(e.team, e, false);
  for (const e of feed.log) if (e.type === 'fired') offer(e.team, e, true);
  return best.map((b, team) => {
    if (!b) return null;
    const verb = b.used ? 'usó' : 'tomó';
    const l = LEGENDS[b.kind];
    return { team, slot: b.slot, kind: b.kind, verb, age: tick - b.tick, who: `${clip(name(b.slot))} ${verb} ${l.item}`, legend: l.legend };
  });
}

/** Slide-in offset (px, 0 once settled) and alpha (1, fading over the last ENTRY_OUT ticks) of an entry of this age. */
export function entryMotion(age: number): { slide: number; alpha: number } {
  const k = Math.min(1, age / ENTRY_IN);
  return { slide: -(1 - (1 - (1 - k) ** 3)) * 28, alpha: age > ENTRY_TICKS - ENTRY_OUT ? Math.max(0, (ENTRY_TICKS - age) / ENTRY_OUT) : 1 };
}
