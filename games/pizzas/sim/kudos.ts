// The extra lines of the results (council: "parte de resultados"): who pulled pizzas out of the oven just before they burnt ("rescató pizzas del fuego") and who
// put fires out. Counted from the bus; pure. They say nothing when nobody did either (a round without the burn rules never emits those events).
import type { GameEvents, Emitter } from './round/events';

export interface KitchenTally {
  rescued: Map<number, number>;
  doused: Map<number, number>;
  washed: Map<number, number>; // the invisible jobs and the silly ones (council B-6): plates washed, dashes, chefs hit by a dash, cuts finished
  dashed: Map<number, number>;
  bumped: Map<number, number>;
  chopped: Map<number, number>;
  reset(): void;
  off(): void;
}
export function tallyKitchen(bus: Emitter<GameEvents>): KitchenTally {
  const rescued = new Map<number, number>(),
    doused = new Map<number, number>(),
    washed = new Map<number, number>(),
    dashed = new Map<number, number>(),
    bumped = new Map<number, number>(),
    chopped = new Map<number, number>();
  const bump = (m: Map<number, number>, id: number) => m.set(id, (m.get(id) ?? 0) + 1);
  const offs = [
    bus.on('oven:rescued', (e) => bump(rescued, e.player)),
    bus.on('fire:out', (e) => bump(doused, e.player)),
    bus.on('washDone', (e) => bump(washed, e.player)),
    bus.on('dash', (e) => bump(dashed, e.player)),
    bus.on('bump', (e) => bump(bumped, e.player)),
    bus.on('chopDone', (e) => bump(chopped, e.player)),
  ];
  return {
    rescued,
    doused,
    washed,
    dashed,
    bumped,
    chopped,
    reset: () => [rescued, doused, washed, dashed, bumped, chopped].forEach((m) => m.clear()),
    off: () => offs.forEach((f) => f()),
  };
}

/** "Name (n)" for the chef(s) with the most; ties list everybody (in id order). Null when nobody counted. */
function top(counts: ReadonlyMap<number, number>, nameOf: (id: number) => string): string | null {
  const best = Math.max(0, ...counts.values());
  if (best <= 0) return null;
  const who = [...counts]
    .filter(([, n]) => n === best)
    .map(([id]) => id)
    .sort((a, b) => a - b)
    .map(nameOf);
  return `${who.join(' y ')} (${best})`;
}

// The silly awards only show when the number is worth a name: a single dash is not a king.
const AWARDS = [
  ['washed', 'Rey del lavaplatos', 3],
  ['dashed', 'Rey del dash', 6],
  ['bumped', 'Más choques', 2],
  ['chopped', 'Mejor cuchillo', 6],
] as const;
export const MAX_KUDOS = 3; // the results screen has room for three lines

/** The kudos of the round, one line each, in the order the results show them (the oven rescues and fires first, then the awards that earned a name). */
export function kudosLines(
  t: Pick<KitchenTally, 'rescued' | 'doused' | 'washed' | 'dashed' | 'bumped' | 'chopped'>,
  nameOf: (id: number) => string,
): string[] {
  const lines: string[] = [];
  const r = top(t.rescued, nameOf),
    d = top(t.doused, nameOf);
  if (r) lines.push(`Rescató pizzas del fuego: ${r}`);
  if (d) lines.push(`Apagó incendios: ${d}`);
  for (const [key, title, min] of AWARDS) {
    if (Math.max(0, ...t[key].values()) < min) continue;
    const w = top(t[key], nameOf);
    if (w) lines.push(`${title}: ${w}`);
  }
  return lines.slice(0, MAX_KUDOS);
}
