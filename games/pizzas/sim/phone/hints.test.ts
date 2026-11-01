// Contextual buttons: the label of A and B must be TRUE. Every (station state x carried item) is built, the chef presses the button, and
// "greyed" has to mean exactly "the press changed nothing". Anything else would teach the player the wrong thing.
import { describe, expect, it } from 'vitest';
import { LABEL_MAX } from '@pichi/core/contract';
import { isIconId } from '@pichi/core/icons';
import { createHintSync, chefHint, HINT_MIN_MS, HINT_REFRESH_MS } from './hints';
import { DIRS, fixedMap, isFloor } from '../maps';
import { addPlayer, createGame, tick, type Controls, type Game, type Item, type Station } from '../overcooked';
import { addFloorItem } from '../rules/floor';
import { createVersusGame } from '../versus/lobby';
import { versusMap } from '../versus/maps';
import type { ClientMsg } from '@pichi/core';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const MAP = fixedMap('10')!; // the one fixed map with every station: three crates, board, oven, plates, window, counter, bin, dirty return and sink
const ITEMS: (Item | null)[] = [null, 'raw0', 'raw1', 'raw2', 'cut0', 'cut1', 'cut2', 'plate', 'dish', 'dishQ', 'dirty'];

const fresh = () => {
  const g = createGame({ mapId: '10', rows: MAP.rows, spawns: MAP.spawns, n: 2, seed: 5 });
  addPlayer(g, 1, 0);
  return g;
};
function face(g: Game, s: Station) {
  const p = g.players.get(1)!;
  const [dx, dy] = DIRS.find(([x, y]) => isFloor(g.grid, s.tx + x, s.ty + y))!;
  Object.assign(p, { x: s.tx + dx + 0.5, y: s.ty + dy + 0.5, fx: -dx, fy: -dy, vx: 0, vy: 0 });
}
// what a press can change; progress is left out because an oven cooks by itself
const snap = (g: Game, s: Station | null) =>
  JSON.stringify([
    g.players.get(1)!.item,
    s && [s.item, s.inputs, s.done, s.count, s.clean],
    g.teams[0]!.delivered,
    g.teams[0]!.rejected,
    g.pantry?.stock,
  ]);

type Variant = { name: string; set: (g: Game, s: Station) => void };
const V = (name: string, set: (g: Game, s: Station) => void = () => {}): Variant => ({ name, set });
const VARIANTS: Record<string, Variant[]> = {
  crate: [V('crate')],
  plates: [
    V('no plates', (_g, s) => {
      s.count = 0;
    }),
    V('2 plates', (_g, s) => {
      s.count = 2;
    }),
  ],
  dirty: [
    V('empty', (_g, s) => {
      s.count = 0;
    }),
    V('2 dirty', (_g, s) => {
      s.count = 2;
    }),
  ],
  sink: [
    V('nothing', (_g, s) => {
      s.count = 0;
      s.clean = 0;
    }),
    V('dirty waiting', (_g, s) => {
      s.count = 2;
      s.clean = 0;
    }),
    V('clean ready', (_g, s) => {
      s.count = 0;
      s.clean = 2;
    }),
  ],
  counter: [
    V('empty'),
    V('with raw1', (_g, s) => {
      s.item = 'raw1';
    }),
  ],
  board: [
    V('empty'),
    V('raw0', (_g, s) => {
      s.item = 'raw0';
    }),
    V('raw1', (_g, s) => {
      s.item = 'raw1';
    }),
    V('raw2', (_g, s) => {
      s.item = 'raw2';
    }),
    V('cut1', (_g, s) => {
      s.item = 'cut1';
    }),
  ],
  pot: [
    V('empty'),
    V('dough in', (_g, s) => {
      s.inputs = [0];
    }),
    V('tomato in', (_g, s) => {
      s.inputs = [1];
    }),
    V('dough+tomato cooking', (_g, s) => {
      s.inputs = [0, 1];
      s.progress = 0.4;
    }),
    V('ready', (_g, s) => {
      s.inputs = [0, 1];
      s.done = true;
      s.progress = 1;
    }),
    V('full with cheese', (_g, s) => {
      s.inputs = [0, 1, 2];
      s.progress = 0.4;
    }),
  ],
  trash: [V('bin')],
  window: [
    V('orders waiting'),
    V('no orders', (g) => {
      g.teams[0]!.orders = [];
    }),
  ],
};
const labels = new Set<string>();

describe('button A: greyed exactly when pressing it changes nothing', () => {
  for (const [kind, variants] of Object.entries(VARIANTS))
    for (const v of variants) {
      it(`${kind} (${v.name}): the label matches the sim for every carried item`, () => {
        for (const [item, nth] of ITEMS.flatMap((it) => (kind === 'crate' ? [0, 1, 2] : [0]).map((n): [Item | null, number] => [it, n]))) {
          // a crate: one per ingredient
          const g = fresh();
          const s = g.stations.filter((x) => x.kind === kind && (kind !== 'crate' || x.crate === nth))[0]!;
          v.set(g, s);
          face(g, s);
          g.players.get(1)!.item = item;
          const h = chefHint(g, g.players.get(1)!);
          const before = snap(g, s);
          tick(g, new Map([[1, { ...idle, a: 1 }]]));
          const changed = snap(g, s) !== before;
          const where = `${kind}/${v.name} carrying ${item}: "${h.a}"`;
          expect(h.a, where).toBeTruthy();
          expect(!!h.aOff, `${where} greyed=${!!h.aOff} but the press ${changed ? 'did' : 'did not'} change something`).toBe(!changed);
          labels.add(h.a!);
          expect(isIconId(h.aIcon), where).toBe(true);
        }
      });
    }

  it('nothing in front: A is greyed, "Tomar" with empty hands and "Dejar" when carrying', () => {
    const g = fresh();
    const p = g.players.get(1)!;
    Object.assign(p, { x: 7.5, y: 4.5, fx: 0, fy: 0.001 });
    while ([...g.stations].some((s) => Math.hypot(s.tx + 0.5 - p.x, s.ty + 0.5 - p.y) < 2.2)) p.x += 0.5; // somewhere clear of every station
    const free = chefHint(g, p);
    expect([free.a, free.aOff]).toEqual(['Tomar', true]);
    p.item = 'raw1';
    expect([chefHint(g, p).a, chefHint(g, p).aOff]).toEqual(['Dejar', true]);
  });

  it('the verbs the council asked for are there: Tomar masa, Al horno, Lavar, Entregar...', () => {
    const verbs = [
      'Tomar masa',
      'Tomar tomate',
      'Tomar queso',
      'Poner en tabla',
      'Al horno',
      'Sacar pizza',
      'Entregar',
      'Botar',
      'Tomar plato',
      'Al lavadero',
    ];
    for (const v of verbs) expect([...labels], v).toContain(v);
  });
});

describe('button B: on exactly when holding it starts a cut, a wash or a dash', () => {
  const started = (g: Game) => {
    const p = g.players.get(1)!;
    return p.cutting || p.dashMs > 0;
  };
  const cases: { name: string; set: (g: Game) => Station | null; item?: Item | null; cd?: number; label: string; on: boolean }[] = [
    {
      name: 'board with dough',
      set: (g) => {
        const s = g.stations.find((x) => x.kind === 'board')!;
        s.item = 'raw0';
        return s;
      },
      label: 'Estirar',
      on: true,
    },
    {
      name: 'board with tomato',
      set: (g) => {
        const s = g.stations.find((x) => x.kind === 'board')!;
        s.item = 'raw1';
        return s;
      },
      label: 'Picar',
      on: true,
    },
    {
      name: 'board with cheese',
      set: (g) => {
        const s = g.stations.find((x) => x.kind === 'board')!;
        s.item = 'raw2';
        return s;
      },
      label: 'Rallar',
      on: true,
    },
    {
      name: 'board already cut',
      set: (g) => {
        const s = g.stations.find((x) => x.kind === 'board')!;
        s.item = 'cut1';
        return s;
      },
      label: 'Picar',
      on: false,
    },
    { name: 'empty board', set: (g) => g.stations.find((x) => x.kind === 'board')!, label: 'Picar', on: false },
    {
      name: 'sink with dirty plates',
      set: (g) => {
        const s = g.stations.find((x) => x.kind === 'sink')!;
        s.count = 2;
        return s;
      },
      label: 'Lavar',
      on: true,
    },
    { name: 'sink with nothing to wash', set: (g) => g.stations.find((x) => x.kind === 'sink')!, label: 'Picar', on: false },
    { name: 'oven (nothing to cut there)', set: (g) => g.stations.find((x) => x.kind === 'pot')!, label: 'Picar', on: false },
    {
      name: 'carrying something at the board',
      set: (g) => g.stations.find((x) => x.kind === 'board')!,
      item: 'raw1',
      label: 'Picar',
      on: false,
    },
  ];
  for (const c of cases)
    it(`${c.name}: "${c.label}", ${c.on ? 'on' : 'greyed'}`, () => {
      const g = fresh();
      const p = g.players.get(1)!;
      const s = c.set(g);
      if (s) face(g, s);
      p.item = c.item ?? null;
      const h = chefHint(g, p);
      expect([h.b, !h.bOff]).toEqual([c.label, c.on]);
      tick(g, new Map([[1, { ...idle, b: true }]]));
      expect(started(g), 'holding B').toBe(c.on);
      labels.add(h.b!);
    });

  const clear = () => {
    const g = fresh();
    const p = g.players.get(1)!;
    Object.assign(p, { x: 7.5, y: 4.5 });
    while (g.stations.some((s) => Math.hypot(s.tx + 0.5 - p.x, s.ty + 0.5 - p.y) < 2.2)) p.x += 0.5;
    return { g, p };
  };
  it('free hands and nothing in front: "Correr", greyed while the dash is cooling down', () => {
    const { g, p } = clear();
    expect([chefHint(g, p).b, !!chefHint(g, p).bOff]).toEqual(['Correr', false]);
    tick(g, new Map([[1, { ...idle, b: true }]]));
    expect(p.dashMs).toBeGreaterThan(0);
    expect([chefHint(g, p).b, !!chefHint(g, p).bOff]).toEqual(['Correr', true]); // running / cooling down
    const q = clear();
    q.p.item = 'raw1';
    expect([chefHint(q.g, q.p).b, !!chefHint(q.g, q.p).bOff]).toEqual(['Picar', true]); // hands full: the dash is not available
  });
});

describe('hints in a versus round with sabotage', () => {
  const mk = () => {
    const m = versusMap('V1')!;
    const g = createVersusGame({
      teams: [
        { id: 0, name: 'A', color: '#000000', icon: 'a', playerIds: [1] },
        { id: 1, name: 'B', color: '#ffffff', icon: 'b', playerIds: [2] },
      ],
      map: { id: m.id, name: m.name, rows: m.rows, spawns: [...m.versus.spawns[0], ...m.versus.spawns[1]], sigma: m.versus.sigma },
      difficulty: 'normal',
      seed: 3,
      modeOptions: { sabotage: 'soft' },
      slotOf: (id) => id - 1,
    });
    return g;
  };
  it('the bag, the catapult, the throw and the rubbish keep their names, with a glyph and a state', () => {
    const g = mk();
    const p = g.players.get(1)!;
    const at = (kind: string) => {
      const s = g.stations.find((x) => x.kind === kind && x.owner === 0)!;
      face1(g, s);
      return s;
    };
    at('trash');
    g.sab!.teams[0]!.bags = 1;
    expect(chefHint(g, p)).toMatchObject({ a: 'Tomar bolsa', aIcon: 'trash' });
    expect(chefHint(g, p).aOff).toBeUndefined();
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(p.item).toBe('trashBag');
    expect(chefHint(g, p)).toMatchObject({ a: 'Botar bolsa' });
    at('catapult');
    expect(chefHint(g, p)).toMatchObject({ a: 'Cargar' });
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(chefHint(g, p)).toMatchObject({ a: 'Apuntando', aOff: true, b: '¡Lanzar!' });
    expect(chefHint(g, p).bOff).toBeUndefined();
  });
  it('a chef that slips has both buttons greyed with "Sin control"', () => {
    const g = mk();
    const p = g.players.get(1)!;
    g.hazards = true;
    p.slip = { t0: 0, dir: [1, 0], dist: 1, slideMs: 500, recoverMs: 100, stopped: false, hit: [] };
    expect(chefHint(g, p)).toMatchObject({ a: 'Sin control', b: 'Sin control', aOff: true, bOff: true });
  });
  it('rubbish within reach: "Recoger"', () => {
    const g = mk();
    const p = g.players.get(1)!;
    Object.assign(p, { x: 4.5, y: 2.5, fx: 1, fy: 0, item: null });
    addFloorItem(g, { tx: 5, ty: 2, item: 'trash', kind: 'trash', team: 0 });
    expect(chefHint(g, p)).toMatchObject({ a: 'Recoger' });
  });
});
function face1(g: Game, s: Station) {
  const p = g.players.get(1)!;
  const [dx, dy] = DIRS.find(([x, y]) => isFloor(g.grid, s.tx + x, s.ty + y))!;
  Object.assign(p, { x: s.tx + dx + 0.5, y: s.ty + dy + 0.5, fx: -dx, fy: -dy, vx: 0, vy: 0 });
}

describe('every label fits the phone', () => {
  it('at most LABEL_MAX characters, in Spanish, never empty, each with a known icon (collected from every case above)', () => {
    expect(labels.size).toBeGreaterThan(25);
    for (const l of labels) {
      expect(l.length, l).toBeLessThanOrEqual(LABEL_MAX);
      expect(l.trim(), l).toBe(l);
      expect(l.length).toBeGreaterThan(0);
    }
  });
});

describe('sending: the state of every tick, whole, with lag in mind', () => {
  const rig = () => {
    const g = fresh();
    const out: Extract<ClientMsg, { t: 'hint' }>[] = [];
    const hs = createHintSync((m) => out.push(m));
    return { g, out, hs, p: g.players.get(1)! };
  };
  it('the first sync sends every chef; an unchanged state is silent until the refresh; a change goes out no faster than HINT_MIN_MS', () => {
    const { g, out, hs, p } = rig();
    hs.sync(g, 0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ t: 'hint', playerId: 1, a: 'Tomar', aOff: true });
    hs.sync(g, 16);
    hs.sync(g, 400);
    expect(out).toHaveLength(1);
    face(g, g.stations.find((s) => s.kind === 'crate' && s.crate === 0)!);
    hs.sync(g, HINT_MIN_MS - 10); // changed, but too soon after the last one (t = 0)
    expect(out).toHaveLength(1);
    hs.sync(g, HINT_MIN_MS + 10);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ a: 'Tomar masa', aIcon: 'dough' });
    expect(p.item).toBeNull();
    hs.sync(g, HINT_MIN_MS + 10 + HINT_REFRESH_MS + 1); // nothing changed for a second: it is sent again (a phone that reconnected is right again)
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual(out[1]);
  });
  it('a chef whose labels flap on every frame gets at most 5 hints per second and ends on the right state', () => {
    const { g, out, hs } = rig();
    const crate = g.stations.find((s) => s.kind === 'crate' && s.crate === 0)!;
    const counter = g.stations.find((s) => s.kind === 'counter')!;
    const times: number[] = [];
    for (let t = 0, i = 0; t <= 5000; t += 16, i++) {
      face(g, i % 2 ? crate : counter); // a different label on every frame
      const n = out.length;
      hs.sync(g, t);
      if (out.length > n) times.push(t);
    }
    expect(times.length).toBeGreaterThan(15); // it does send (a green that sent nothing proves nothing)
    for (const t0 of times) expect(times.filter((t) => t >= t0 && t < t0 + 1000).length).toBeLessThanOrEqual(5);
    for (let k = 1; k < times.length; k++) expect(times[k]! - times[k - 1]!).toBeGreaterThanOrEqual(HINT_MIN_MS);
    face(g, crate);
    hs.sync(g, 5000 + HINT_MIN_MS + 20); // the flapping stops: the next sync after the gap carries the last state
    expect(out.at(-1)).toMatchObject({ a: 'Tomar masa' });
  });
  it('a phone that only sees the LAST message of a burst still ends up right (the messages are states, not events)', () => {
    const { g, out, hs } = rig();
    const crate = g.stations.find((s) => s.kind === 'crate' && s.crate === 1)!;
    const counter = g.stations.find((s) => s.kind === 'counter')!;
    let now = 0;
    for (let i = 0; i < 12; i++) {
      face(g, i % 2 ? crate : counter);
      now += HINT_MIN_MS + 10; // one step past the cap (it was 60 ms against a 50 ms cap)
      hs.sync(g, now);
    }
    face(g, crate);
    now += HINT_MIN_MS + 10;
    hs.sync(g, now);
    const last = out[out.length - 1]!;
    expect([last.a, last.aIcon, !!last.aOff]).toEqual(['Tomar tomate', 'crate', false]);
  });
  it('leaving the round hands the labels back to the game, and a chef that left gets them back too', () => {
    const { g, out, hs } = rig();
    addPlayer(g, 2, 1);
    hs.sync(g, 0);
    expect(out.map((m) => m.playerId).sort()).toEqual([1, 2]);
    g.players.delete(2);
    hs.sync(g, 10);
    expect(out.slice(2)).toEqual([{ t: 'hint', playerId: 2, a: null, b: null }]);
    hs.sync(null, 20);
    expect(out.slice(3)).toEqual([{ t: 'hint', playerId: 1, a: null, b: null }]);
    hs.sync(null, 30);
    expect(out).toHaveLength(4);
  });
  it("a ghost (dropped phone) is sent the game's own labels", () => {
    const { g, out, hs, p } = rig();
    p.ghost = true;
    hs.sync(g, 0);
    expect(out[0]).toEqual({ t: 'hint', playerId: 1, a: null, b: null });
  });
});
