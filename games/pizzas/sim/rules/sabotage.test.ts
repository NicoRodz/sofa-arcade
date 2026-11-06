import { describe, expect, it } from 'vitest';
import { FIXED_MAPS, parseMap } from '../maps';
import { createGame, tick, type Controls, type Game, type Item } from '../overcooked';
import { addFloorItem } from './floor';
import { DESECHOS_DRIP_MS, type SabotageMode } from '../sabotage-config';
import { landingTiles, sabotageHint } from './sabotage';
import { floorItemNear, targetStation } from '../overcooked';
import { LABEL_MAX } from '@pichi/core/contract';
import { versusMap } from '../versus/maps';
import { mk, run, face, station, pressA, hashOf } from './sabotage.kit';

describe('the catapult letter and the maps', () => {
  it('Y is a versus-only letter: a coop map refuses it, a versus game accepts it, and no coop map has one', () => {
    const rows = versusMap('V1')!.rows;
    expect(() => parseMap(rows)).toThrow(/unknown tile 'Y' at \(5, 8\): only a versus map has it/);
    expect(parseMap(rows, true)[8]![5]).toMatchObject({ kind: 'station', station: 'catapult' });
    expect(() => createGame({ rows, n: 2 })).toThrow(/only a versus map has it/);
    for (const m of FIXED_MAPS) expect(m.rows.join('')).not.toContain('Y');
  });
  it('V1-V5 carry one catapult per kitchen, twins by sigma, and every kitchen has landing tiles to spare', () => {
    for (const id of ['V1', 'V2', 'V3', 'V4', 'V5']) {
      const { g } = mk({
        map: id,
        teams: [
          [1, 2],
          [3, 4],
        ],
      });
      const ys = g.stations.filter((s) => s.kind === 'catapult');
      expect(ys.map((s) => s.owner).sort(), id).toEqual([0, 1]);
      expect(g.sab, id).not.toBeNull();
      expect(landingTiles(g, 0).length, id).toBeGreaterThanOrEqual(6);
      expect(landingTiles(g, 1).length, id).toBeGreaterThanOrEqual(6);
    }
  });
  it('a map with no catapult switches the sabotage off by itself (and hazards stay off)', () => {
    const g = createGame({
      rows: versusMap('11-vs')!.rows,
      spawns: [...versusMap('11-vs')!.versus.spawns[0], ...versusMap('11-vs')!.versus.spawns[1]],
      teams: [{ playerIds: [1, 2] }, { playerIds: [3, 4] }],
      sabotage: 'chaos',
      sigma: versusMap('11-vs')!.versus.sigma,
    });
    expect(g.sab).toBeNull();
    expect(g.hazards).toBe(false);
  });
  it('mode off, or no sigma, or coop: no sabotage state at all', () => {
    expect(mk({ mode: 'off' }).g.sab).toBeNull();
    expect(mk({ mode: 'off' }).g.hazards).toBe(false);
    expect(createGame({ n: 2 }).sab).toBeNull();
  });
  it('the modes set the sim: Suave on Fácil only slips, Normal drops the item, Caos spoils raw ingredients', () => {
    const e = mk({ mode: 'soft', difficulty: 'easy' }).g,
      n = mk({ mode: 'soft', difficulty: 'normal' }).g,
      c = mk({ mode: 'chaos', difficulty: 'easy' }).g;
    expect([e.slipDrops, e.spoilRaw]).toEqual([false, false]);
    expect([n.slipDrops, n.spoilRaw]).toEqual([true, false]);
    expect([c.slipDrops, c.spoilRaw]).toEqual([true, true]);
    expect(e.hazards).toBe(true);
  });
});

describe('desechos and bags: what fills the bin', () => {
  const bin = (g: Game, id: number, item: Item) => {
    const p = face(g, id, station(g, 'trash', g.players.get(id)!.team));
    p.item = item;
    pressA(g, id);
  };
  it('an item binned is +1, a baked pizza +2, rubbish +1, a caught bag +3; three make a bag', () => {
    const { g, log } = mk({ mode: 'chaos' });
    const st = g.sab!.teams[0]!;
    bin(g, 1, 'raw0');
    expect(st.desechos).toBe(1);
    bin(g, 1, 'dish');
    expect(st.bags).toBe(1);
    expect(st.desechos).toBe(0); // 1 + 2
    bin(g, 1, 'trash');
    expect(st.desechos).toBe(1);
    bin(g, 1, 'trashBag');
    expect(st.bags).toBe(2);
    expect(st.desechos).toBe(1); // 1 + 3 = 4: one more bag (stock 2) and 1 left over
    expect(log['sabotage:bagReady']!.map((e) => [e.p.team, e.p.bags])).toEqual([
      [0, 1],
      [0, 2],
    ]);
    expect(log['trash:binned']!.map((e) => [e.p.gained, e.p.item])).toEqual([
      [1, 'raw0'],
      [2, 'dish'],
      [1, 'trash'],
      [3, 'trashBag'],
    ]);
    expect(g.sab!.teams[1]!.desechos).toBe(0); // the other team's counter is its own
  });
  it('the base trickle gives +1 every 15 s: a bag every 45 s with nobody doing anything', () => {
    const { g, log } = mk();
    run(g, DESECHOS_DRIP_MS * 3 - 100);
    expect(g.sab!.teams[0]!.bags).toBe(0);
    run(g, 200);
    expect(g.sab!.teams.map((t) => t.bags)).toEqual([1, 1]);
    expect(log['sabotage:bagReady']).toHaveLength(2);
  });
  it('a team two orders behind gets the trickle 1.5 times faster', () => {
    const { g } = mk();
    g.teams[1]!.delivered = 2;
    run(g, 15_000);
    run(g, 10_000 + 100); // team 0 (behind) scheduled its second drop 10 s later, team 1 15 s later
    expect(g.sab!.teams[0]!.desechos).toBeCloseTo(2, 5);
    expect(g.sab!.teams[1]!.desechos).toBeCloseTo(1, 5);
  });
  it('the stock is full (Suave: 1 bag): the counter stops adding', () => {
    const { g, log } = mk({ mode: 'soft' });
    const st = g.sab!.teams[0]!;
    bin(g, 1, 'dish');
    bin(g, 1, 'raw0');
    expect(st.bags).toBe(1);
    bin(g, 1, 'dish');
    bin(g, 1, 'dish');
    bin(g, 1, 'dish');
    expect(st.bags).toBe(1);
    expect(st.desechos).toBe(0); // it stayed where it was: nothing was added while the stock is full
    expect(log['trash:binned']!.slice(2).map((e) => e.p.gained)).toEqual([0, 0, 0]);
  });
  it('A with empty hands at the bin takes the bag (once); with no bag waiting nothing happens', () => {
    const { g, log } = mk();
    const p = face(g, 1, station(g, 'trash', 0));
    pressA(g, 1);
    expect(p.item).toBeNull();
    expect(log['interactInvalid']).toHaveLength(1);
    g.sab!.teams[0]!.bags = 1;
    pressA(g, 1);
    expect(p.item).toBe('trashBag');
    expect(g.sab!.teams[0]!.bags).toBe(0);
    pressA(g, 1); // with the bag in hand at the bin: it is binned for 3
    expect([p.item, g.sab!.teams[0]!.bags]).toEqual([null, 1]);
  });
  it('with the sabotage off nothing counts and the bin is the bin it always was', () => {
    const { g, log } = mk({ mode: 'off' });
    const p = face(g, 1, station(g, 'trash', 0));
    p.item = 'dish';
    pressA(g, 1);
    expect(p.item).toBeNull();
    expect(g.sab).toBeNull();
    expect(log['trash:binned']).toBeUndefined();
  });
});

describe('determinism and the guarantee that off is off', () => {
  const script = (id: number, i: number): Controls => {
    const k = (i + id * 13) % 480;
    return k < 240 ? { x: 1, y: 0, a: i % 11 === 0 ? 1 : 0, b: i % 97 === 0 } : { x: -1, y: 0.3, a: i % 17 === 0 ? 1 : 0, b: false };
  };
  const play = (mode: SabotageMode) => {
    const { g } = mk({ mode, seed: 9 });
    g.sab?.teams.forEach((t) => {
      t.bags = 1;
    });
    for (let i = 0; i < 3000; i++) tick(g, new Map([...g.players.keys()].map((id): [number, Controls] => [id, script(id, i)])));
    return g;
  };
  it('same seed, same inputs: the same state hash, twice (sabotage on)', () => {
    expect(hashOf(play('chaos'))).toBe(hashOf(play('chaos')));
  });
  it("the sabotage never touches the orders' random stream: queues are the same with it on, off and in chaos", () => {
    const q = (g: Game) => JSON.stringify(g.teams.map((t) => t.orders.map((o) => [o.recipe, o.expiresAt, o.id])));
    const nothing = (mode: SabotageMode) => {
      const { g } = mk({ mode, seed: 9 });
      run(g, 100_000);
      return q(g);
    };
    expect(nothing('soft')).toBe(nothing('off'));
    expect(nothing('chaos')).toBe(nothing('off'));
  });
});

describe('the labels of the two buttons (no third button)', () => {
  const hint = (g: Game, id: number) => {
    const p = g.players.get(id)!;
    return sabotageHint(g, p, targetStation(g, p), !!floorItemNear(g, p));
  };
  it('A and B are only renamed: Tomar bolsa at the bin with a bag waiting, Cargar at the catapult with the bag, ¡Lanzar! while aiming, Recoger next to rubbish', () => {
    const { g } = mk();
    expect(hint(g, 1)).toEqual({ a: null, b: null });
    face(g, 1, station(g, 'trash', 0));
    expect(hint(g, 1)).toEqual({ a: null, b: null }); // nothing waiting
    g.sab!.teams[0]!.bags = 1;
    expect(hint(g, 1)).toEqual({ a: 'Tomar bolsa', b: null });
    g.players.get(1)!.item = 'trashBag';
    expect(hint(g, 1)).toEqual({ a: 'Botar bolsa', b: null });
    face(g, 1, station(g, 'catapult', 0));
    expect(hint(g, 1)).toEqual({ a: 'Cargar', b: null });
    pressA(g, 1);
    expect(hint(g, 1)).toEqual({ a: null, b: '¡Lanzar!' });
    const q = g.players.get(2)!;
    Object.assign(q, { x: 4.5, y: 2.5, fx: 1, fy: 0 });
    addFloorItem(g, { tx: 5, ty: 2, item: 'trash', kind: 'trash', team: 0 });
    expect(hint(g, 2)).toEqual({ a: 'Recoger', b: null });
    for (const h of [{ a: 'Tomar bolsa' }, { a: 'Botar bolsa' }, { a: 'Cargar' }, { b: '¡Lanzar!' }, { a: 'Recoger' }])
      for (const v of Object.values(h)) expect(v.length).toBeLessThanOrEqual(LABEL_MAX);
  });
  it('with the sabotage off there is nothing to rename', () => {
    const { g } = mk({ mode: 'off' });
    expect(sabotageHint(g, g.players.get(1)!, null, true)).toEqual({ a: null, b: null });
  });
});
