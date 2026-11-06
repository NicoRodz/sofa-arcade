import { describe, expect, it } from 'vitest';
import { addFloorItem, pilesIn } from './floor';
import { RULES, LAND_AFTER_MS, type SabotageMode } from '../sabotage-config';
import { catapultState, landingTiles } from './sabotage';
import { mk, run, face, station, pressA, pressB, load, flights } from './sabotage.kit';

describe('limits: cooldown, per minute, piles', () => {
  it('Suave: 12 s between two throws of a team; the catapult refuses the bag meanwhile (the chef keeps it)', () => {
    const { g, log } = mk({ mode: 'soft' });
    load(g, 1);
    pressB(g, 1);
    expect(catapultState(g, 0)).toBe('cooldown');
    const p = g.players.get(1)!;
    p.item = 'trashBag';
    face(g, 1, station(g, 'catapult', 0));
    pressA(g, 1);
    expect(p.item).toBe('trashBag');
    expect(log['sabotage:blocked']!.map((e) => e.p.why)).toEqual(['cooldown']);
    run(g, RULES.soft.cooldownMs - 400); // 12 s after the throw
    pressA(g, 1);
    expect(log['sabotage:blocked']).toHaveLength(2);
    run(g, 600);
    pressA(g, 1);
    expect(p.item).toBeNull();
    expect(g.sab!.teams[0]!.aim).not.toBeNull();
  });
  it('Caos: 6 s between throws', () => {
    const { g } = mk({ mode: 'chaos' });
    load(g, 1);
    pressB(g, 1);
    run(g, 5000);
    expect(catapultState(g, 0)).toBe('cooldown');
    run(g, 1100);
    expect(['ready', 'piles']).toContain(catapultState(g, 0));
  });
  it('Suave: 4 throws per sliding minute, then "window" until the first one is a minute old', () => {
    const { g, log } = mk({ mode: 'soft' });
    for (let i = 0; i < 4; i++) {
      load(g, 1);
      pressB(g, 1);
      run(g, RULES.soft.cooldownMs + 100);
      g.floor.length = 0;
    } // rubbish removed: this test is about the window
    expect(g.time).toBeGreaterThan(36_000);
    expect(catapultState(g, 0)).toBe('window');
    const p = g.players.get(1)!;
    p.item = 'trashBag';
    face(g, 1, station(g, 'catapult', 0));
    pressA(g, 1);
    expect(log['sabotage:blocked']!.at(-1)!.p.why).toBe('window');
    run(g, 60_000 - g.time + 600);
    expect(catapultState(g, 0)).toBe('ready');
  });
  it('Caos: 6 throws per minute', () => {
    const { g } = mk({ mode: 'chaos' });
    for (let i = 0; i < 6; i++) {
      load(g, 1);
      pressB(g, 1);
      run(g, RULES.chaos.cooldownMs + 100);
      g.floor.length = 0;
    }
    expect(g.time).toBeLessThan(60_000);
    expect(catapultState(g, 0)).toBe('window');
  });
  it('maximum piles on the rival floor (Suave 3, Caos 4), counting bags in the air: the catapult goes red and keeps the bag', () => {
    const { g, log } = mk({ mode: 'soft' });
    const tiles = landingTiles(g, 1);
    for (const i of [0, 3]) addFloorItem(g, { tx: tiles[i]![0], ty: tiles[i]![1], item: 'trash', kind: 'trash', team: 1 });
    expect(catapultState(g, 0)).toBe('ready');
    addFloorItem(g, { tx: tiles[5]![0], ty: tiles[5]![1], item: 'trash', kind: 'trash', team: 1 });
    expect(catapultState(g, 0)).toBe('piles');
    const p = g.players.get(1)!;
    p.item = 'trashBag';
    face(g, 1, station(g, 'catapult', 0));
    pressA(g, 1);
    expect(p.item).toBe('trashBag');
    expect(log['sabotage:blocked']!.map((e) => e.p.why)).toEqual(['piles']);
    // a bag in the air counts as a pile too
    const { g: h } = mk({ mode: 'soft' });
    for (const i of [0, 3]) addFloorItem(h, { tx: tiles[i]![0], ty: tiles[i]![1], item: 'trash', kind: 'trash', team: 1 });
    load(h, 1);
    pressB(h, 1);
    expect(flights(h, 0)).toHaveLength(1);
    expect(pilesIn(h, 1)).toBe(2);
    run(h, RULES.soft.cooldownMs + 100);
    expect(catapultState(h, 0)).toBe('piles'); // 2 down + 1 landed
  });
  it('Caos: the bag leaves a double pile (the target and a neighbour), never above the maximum of 4', () => {
    const { g, log } = mk({ mode: 'chaos' });
    load(g, 1);
    pressB(g, 1);
    run(g, LAND_AFTER_MS + 40);
    expect(g.floor).toHaveLength(2);
    expect(log['sabotage:land']![0]!.p.double).toBe(true);
    const [a, b] = g.floor;
    expect(Math.abs(a!.tx - b!.tx) + Math.abs(a!.ty - b!.ty)).toBe(1);
    run(g, RULES.chaos.cooldownMs);
    load(g, 1);
    pressB(g, 1);
    run(g, LAND_AFTER_MS + 40);
    expect(pilesIn(g, 1)).toBeLessThanOrEqual(4);
  });
  it('Suave: single piles that last 25 s; Caos 40 s; on the kitchen of a team with k > 1 they last 0.85 times that', () => {
    const t = (mode: SabotageMode, o: { teams?: number[][] } = {}) => {
      const { g, log } = mk({ mode, ...o });
      load(g, 1);
      pressB(g, 1);
      run(g, LAND_AFTER_MS + 40);
      const born = g.floor[0]!.bornAt;
      return { life: g.floor[0]!.expiresAt - born, g, log };
    };
    expect(t('soft').life).toBe(25_000);
    expect(t('chaos').life).toBe(40_000);
    const small = t('soft', {
      teams: [
        [1, 2, 5],
        [3, 4],
      ],
    }); // team 1 is the small one: k = 1.22
    expect(small.g.teams[1]!.k).toBeGreaterThan(1);
    expect(small.life).toBeCloseTo(25_000 * 0.85, 3);
    run(small.g, 21_300);
    expect(small.g.floor).toHaveLength(0);
    expect(small.log['trash:decayed']).toHaveLength(1);
  });
  it('3 v 2: the big team waits k times as long between throws', () => {
    const { g } = mk({
      mode: 'soft',
      teams: [
        [1, 2, 5],
        [3, 4],
      ],
    });
    const k = g.teams[1]!.k;
    expect(g.teams[0]!.k).toBe(1);
    load(g, 1);
    pressB(g, 1);
    run(g, RULES.soft.cooldownMs * k - 500);
    expect(catapultState(g, 0)).toBe('cooldown');
    run(g, 700);
    expect(catapultState(g, 0)).not.toBe('cooldown');
    const { g: h } = mk({
      mode: 'soft',
      teams: [
        [1, 2, 5],
        [3, 4],
      ],
    }); // the small team waits the base 12 s
    load(h, 3);
    pressB(h, 3);
    run(h, RULES.soft.cooldownMs + 100);
    expect(catapultState(h, 1)).not.toBe('cooldown');
  });
  it('a chef that drops while it aims gives the bag back to the stock', () => {
    const { g } = mk();
    load(g, 1);
    expect(g.sab!.teams[0]!.bags).toBe(0);
    // dropPlayer lives in the sim
    return import('../overcooked').then(({ dropPlayer }) => {
      dropPlayer(g, 1);
      expect(g.sab!.teams[0]!.aim).toBeNull();
      expect(g.sab!.teams[0]!.bags).toBe(1);
    });
  });
});
