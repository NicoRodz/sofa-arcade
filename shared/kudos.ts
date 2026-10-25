// The extra lines of the results (council: "parte de resultados"): who pulled pizzas out of the oven just before they burnt ("rescató pizzas del fuego") and who
// put fires out. Counted from the bus; pure. They say nothing when nobody did either (a round without the burn rules never emits those events).
import type { Emitter, GameEvents } from './events';

export interface KitchenTally {
  rescued: Map<number, number>;
  doused: Map<number, number>;
  reset(): void;
  off(): void;
}
export function tallyKitchen(bus: Emitter<GameEvents>): KitchenTally {
  const rescued = new Map<number, number>(),
    doused = new Map<number, number>();
  const bump = (m: Map<number, number>, id: number) => m.set(id, (m.get(id) ?? 0) + 1);
  const offs = [bus.on('oven:rescued', (e) => bump(rescued, e.player)), bus.on('fire:out', (e) => bump(doused, e.player))];
  return {
    rescued,
    doused,
    reset: () => {
      rescued.clear();
      doused.clear();
    },
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

/** The kudos of the round, one line each, in the order the results show them. */
export function kudosLines(t: Pick<KitchenTally, 'rescued' | 'doused'>, nameOf: (id: number) => string): string[] {
  const lines: string[] = [];
  const r = top(t.rescued, nameOf),
    d = top(t.doused, nameOf);
  if (r) lines.push(`Rescató pizzas del fuego: ${r}`);
  if (d) lines.push(`Apagó incendios: ${d}`);
  return lines;
}
