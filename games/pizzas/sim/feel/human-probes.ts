// What counts as a landed press for each action and the distance field the bot walks along (moved out of human-bot.ts).
import type { Action, Sim } from './human-params';

export interface Probe {
  ok(g: any, p: any, st: any): boolean;
  setup(g: any, p: any, st: any): void;
}
export const hold = (item: string | null) => (_g: any, p: any) => {
  p.item = item;
};
export const PROBES: Record<Action, Probe> = {
  take: { setup: hold(null), ok: (_g, p, st) => p.item === `raw${st.crate}` },
  chop: {
    setup: (_g, p, st) => {
      p.item = null;
      st.item = 'raw0';
    },
    ok: (g, p, st) => !!p.cutting && g.stations[p.chopAt] === st,
  },
  place: {
    setup: (_g, p, st) => {
      p.item = 'cut0';
      st.inputs = [];
    },
    ok: (_g, p, st) => !p.item && st.inputs.length > 0,
  },
  oven: {
    setup: (_g, p, st) => {
      p.item = 'plate';
      Object.assign(st, { inputs: [0, 1], done: true, progress: 1 });
    },
    ok: (_g, p) => p.item === 'dish',
  },
  deliver: {
    setup: (g, p) => {
      p.item = 'dish';
      if (!g.orders.some((o: any) => o.recipe === 'marinara'))
        g.orders.push({ id: 99, expiresAt: g.time + 60_000, warned: false, recipe: 'marinara' });
    },
    ok: (g, p) => !p.item && g.delivered > 0,
  }, // an order that this dish serves is always waiting (before R16 a dish nobody asked for was simply not taken)
  drop: {
    setup: (_g, p, st) => {
      p.item = 'raw1';
      st.item = null;
    },
    ok: (_g, p, st) => !p.item && st.item === 'raw1',
  },
  pickup: {
    setup: (_g, p, st) => {
      p.item = null;
      st.item = 'cut1';
    },
    ok: (_g, p) => p.item === 'cut1',
  },
};

// BFS distances over floor tiles from the tiles that touch the station.
export function fieldTo(sim: Sim, g: any, s: any): Map<string, number> {
  const d = new Map<string, number>(),
    q: [number, number][] = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const x = s.tx + dx,
      y = s.ty + dy;
    if (sim.isFloor(g.grid, x, y)) {
      d.set(`${x},${y}`, 0);
      q.push([x, y]);
    }
  }
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx,
        ny = y + dy,
        k = `${nx},${ny}`;
      if (sim.isFloor(g.grid, nx, ny) && !d.has(k)) {
        d.set(k, d.get(`${x},${y}`)! + 1);
        q.push([nx, ny]);
      }
    }
  }
  return d;
}
