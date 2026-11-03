// PR6 risk: can the packing tape shut anyone in or cover a door of Islas? It only cuts blasts and locks the paint under it; this fuzz proves movement never sees it.
// Same round twice (4 archetypes, the living map, Mudanza, the sabotages, 4 scripted bodies): in A the tape is erased the tick it lands, in B it stays, and in B a
// strip over EVERY floor tile is kept down as the worst case. Every body position and the whole solid field must be identical tick by tick.
import { describe, expect, it } from 'vitest';
import { ARCHETYPES, MAP_H, MAP_W, archetypeOf, generateMap, sealedRooms, solidAt, type Archetype } from '../../map';
import { createManchazo, stepManchazo, type ManchazoInput, type ManchazoState } from '../../sim';
import { scripts } from '../match-drive';
import { onlyPlus } from '../events-plus/plus-drive';
import { wrap } from './wrap-drive';

const TICKS = 900;
const seedsOf = (kind: Archetype, n: number): number[] => {
  const out: number[] = [];
  for (let i = 0; out.length < n; i++) if (archetypeOf((i * 3359 + 17) % 33_554_432) === kind) out.push((i * 3359 + 17) % 33_554_432);
  return out;
};
const round = (mapSeed: number, seed: number): ManchazoState =>
  onlyPlus(
    createManchazo({
      slots: [0, 1, 2, 3],
      teams: [0, 1, 0, 1],
      seed,
      mapSeed,
      living: true,
      sabotage: true,
      sabotagePlus: true,
      sabotageV2: true,
      events: true,
      eventsPlus: true,
    }),
    'move',
    100,
  );
const floorTiles = (s: ManchazoState): number[] => {
  const out: number[] = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (!solidAt(s.grid.map, x, y)) out.push(y * MAP_W + x);
  return out;
};

interface Trace {
  frames: string[];
  tapes: number;
  moved: boolean;
}
/** Plays the round; `keep` leaves the tape down (B) or erases it as it lands (A). Everyone holds the tape card and presses B every 50 ticks. */
function play(mapSeed: number, seed: number, keep: boolean): Trace {
  const s = round(mapSeed, seed);
  const first = Array.from(s.grid.map.solid).join('');
  const ps = scripts(4, seed);
  const frames: string[] = [];
  for (let t = 0; t < TICKS && !s.grid.over; t++) {
    const inputs = new Map<number, ManchazoInput>();
    ps.forEach((p, i) => {
      if (s.match.sab!.held[i] === null) s.match.sab!.held[i] = 'tape';
      inputs.set(s.grid.bodies[i]!.slot, { ...p(), drop: false, use: t % 50 === i * 7 });
    });
    if (keep && t % 20 === 0) wrap(s).strips.push({ owner: 9, team: 0, tiles: floorTiles(s), left: 360 }); // worst case: every floor tile under tape
    stepManchazo(s, inputs);
    if (!keep) wrap(s).strips = [];
    frames.push(`${s.grid.bodies.map((b) => `${b.x},${b.y}`).join(';')}|${Array.from(s.grid.map.solid).join('')}`);
  }
  return { frames, tapes: wrap(s).log.filter((e) => e.kind === 'tape').length, moved: Array.from(s.grid.map.solid).join('') !== first };
}

describe.each(ARCHETYPES)('packing tape never shuts anyone in (%s, living map, Mudanza)', (kind) => {
  it('with a strip over every floor tile, bodies and the solid field evolve exactly as with no tape at all, on 5 seeds', () => {
    let tapes = 0;
    let moved = 0;
    for (const mapSeed of seedsOf(kind, 5)) {
      const a = play(mapSeed, 11, false);
      const b = play(mapSeed, 11, true);
      expect(b.frames.length, `seed ${mapSeed}`).toBe(a.frames.length);
      const bad = a.frames.findIndex((f, i) => f !== b.frames[i]);
      expect(bad, `seed ${mapSeed}: first tick where tape changed movement or the map`).toBe(-1);
      tapes += b.tapes;
      moved += b.moved ? 1 : 0;
    }
    expect(tapes).toBeGreaterThan(0); // the real tape was put too, not only the injected strips
    expect(moved).toBeGreaterThan(0); // and Mudanza really moved furniture in some of the rounds
  });
});

describe('packing tape and the doors of Islas', () => {
  it('every sealed room is reachable over floor from the exits, and tape (which is never furniture) does not change that', () => {
    for (const mapSeed of seedsOf('islas', 12)) {
      const g = generateMap(mapSeed);
      const s = round(mapSeed, 3);
      const rooms = sealedRooms(g.map);
      expect(rooms.length).toBeGreaterThan(0);
      for (const plan of [false, true]) {
        if (plan) wrap(s).strips.push({ owner: 9, team: 0, tiles: floorTiles(s), left: 360 });
        const seen = new Set<number>(g.map.spawns[0]!.map(([x, y]) => y * MAP_W + x));
        const q = [...seen];
        for (let h = 0; h < q.length; h++)
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const x = (q[h]! % MAP_W) + dx;
            const y = Math.floor(q[h]! / MAP_W) + dy;
            if (solidAt(s.grid.map, x, y) || seen.has(y * MAP_W + x)) continue;
            seen.add(y * MAP_W + x);
            q.push(y * MAP_W + x);
          }
        for (const r of rooms) expect(seen.has(r.core[1] * MAP_W + r.core[0]), `seed ${mapSeed} room ${r.core} tape ${plan}`).toBe(true);
      }
    }
  });
});
