import { describe, expect, it } from 'vitest';
import { MAP_H, MAP_W, footprint, solidAt } from '../../map';
import { createManchazo, dropLoot, stepManchazo, type ManchazoState } from '../../sim';
import { scripts } from '../match-drive';
import { give, put, res } from './rescue-drive';

// Loot never lands on a wall or under a living element, in the four map archetypes with the living map on: forced drops from every tile of the map at several
// moments of the round, and whole rounds played with the loot checked on every tick.
const full = { sabotage: true, sabotagePlus: true, events: true, eventsPlus: true, living: true, phases: true, rescue: true } as const;
const TEAMS = [0, 1, 0, 1, 0, 1];

function seedsByArchetype(): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (let m = 1; m < 400; m++) {
    const s = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 1, mapSeed: m, living: true });
    const list = out.get(s.mapArchetype!) ?? [];
    if (list.length < 2) out.set(s.mapArchetype!, [...list, m]);
  }
  return out;
}

/** Why a loot tile is invalid ('' when it is fine): a wall, a tile a living part may occupy, the fountain, a spawner, or another loot. */
function bad(s: ManchazoState): string {
  const live = s.match.live!;
  const parts = new Set(live.pairs.flatMap((p) => footprint(p.spec).map(([x, y]) => y * MAP_W + x)));
  if (live.fountain) parts.add(live.fountain.y * MAP_W + live.fountain.x);
  const pickups = new Set(s.match.sab!.pickups.map((p) => p.y * MAP_W + p.x));
  const seen = new Set<number>();
  for (const l of res(s).loot) {
    const k = l.y * MAP_W + l.x;
    if (solidAt(s.grid.map, l.x, l.y)) return `wall ${l.x},${l.y}`;
    if (parts.has(k)) return `living ${l.x},${l.y}`;
    if (pickups.has(k)) return `spawner ${l.x},${l.y}`;
    if (seen.has(k)) return `stacked ${l.x},${l.y}`;
    seen.add(k);
  }
  return '';
}

describe('loot placement: the four archetypes with the living map', () => {
  const seeds = seedsByArchetype();
  const played = { drops: 0, seen: 0 }; // some scripted rounds never drop a card: the sum over the eight must (the test below is the last one)
  it('the four archetypes are covered', () => expect([...seeds.keys()].sort()).toEqual(['islas', 'ocho', 'plaza', 'pasillos'].sort()));
  for (const [arch, list] of seeds)
    for (const mapSeed of list) {
      it(`${arch} ${mapSeed}: a drop from any tile, early and late, lands on a valid tile`, () => {
        const s = createManchazo({ slots: TEAMS.map((_t, i) => i), teams: TEAMS, seed: mapSeed ^ 3, mapSeed, ...full });
        let drops = 0;
        for (const at of [0, 240, 700, 1500, 3000]) {
          while (s.grid.tick < at) stepManchazo(s, new Map());
          for (let y = 0; y < MAP_H; y++)
            for (let x = 0; x < MAP_W; x++) {
              put(s, 0, x, y);
              give(s, 0, 'fan');
              res(s).loot.length = 0;
              dropLoot(s, 0);
              drops += res(s).loot.length;
              expect(bad(s), `${arch} ${mapSeed} tick ${at} from ${x},${y}`).toBe('');
            }
        }
        expect(drops).toBeGreaterThan(5 * 100);
      });
      it(`${arch} ${mapSeed}: a whole round played, every loot valid on every tick`, () => {
        const s = createManchazo({ slots: TEAMS.map((_t, i) => i), teams: TEAMS, seed: mapSeed ^ 9, mapSeed, ...full });
        let seen = 0;
        const ps = scripts(TEAMS.length, mapSeed);
        while (!s.grid.over) {
          stepManchazo(s, new Map(ps.map((p, i) => [s.grid.bodies[i]!.slot, p()])));
          seen += res(s).loot.length;
          if (res(s).loot.length) expect(bad(s), `${arch} ${mapSeed} tick ${s.grid.tick}`).toBe('');
        }
        played.drops += res(s).log.filter((e) => e.kind === 'drop').length;
        played.seen += seen;
      });
    }
  it('the played rounds dropped cards that lay on the floor (the check above was not empty)', () => {
    expect(played.drops).toBeGreaterThan(0);
    expect(played.seen).toBeGreaterThan(0);
  });
});
