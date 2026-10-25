// Scenarios of the A5 dynamics for the two-bot tests (obst.dynamics.ws.test.ts): a small level per dynamic and the "phone" that plays each slot. A controller sees what the
// screen sees (the world's snapshot) and answers with the stick and the two buttons, exactly like a phone; the ws test turns every answer into packets through the relay.
import { ObstBot, PLAYER_H, PLAYER_W, TILE, type BotOut, type BotView, type LevelDef, type WorldSnap } from '../../shared/games/obstaculos';

export type Ctrl = (slot: number, snap: WorldSnap, frame: number) => BotOut;
export interface Scenario {
  id: string;
  level: LevelDef;
  mode: 'chain' | 'free';
  world: 'beach' | 'forest' | 'glacier' | 'mine' | 'volcano' | 'summit' | null;
  make: () => Ctrl;
  maxSec: number;
}

const idle: BotOut = { x: 0, y: 0, jump: false, grab: false };
const cell = (rows: string[], x: number, y: number, s: string): void => {
  rows[y] = rows[y]!.slice(0, x) + s + rows[y]!.slice(x + s.length);
};
// rows x cols of air with a closed frame (wall columns at both ends) and a floor of `floor` rows at the bottom
function room(w: number, h: number, floor = 2): string[] {
  return Array.from({ length: h }, (_, y) => (y >= h - floor ? '#'.repeat(w) : `#${'.'.repeat(w - 2)}#`));
}
const base = (id: string, rows: string[], extra: Partial<LevelDef> = {}): LevelDef => ({
  id,
  name: id,
  biome: 'glacier',
  players: { min: 2, max: 2 },
  tether: 'any',
  stars: 1,
  parSec: 60,
  rows,
  ...extra,
});

// ObstBot for both slots (walls, gaps, spikes, tower + hand): the dynamics that only need walking and jumping
const withBots = (): Ctrl => {
  const bots = [new ObstBot(0), new ObstBot(1)];
  return (slot, snap) => bots[slot]!.decide({ tick: snap.tick, grid: snap.grid, players: snap.players, goal: snap.goal } satisfies BotView);
};
const me = (snap: WorldSnap, slot: number) => snap.players.find((p) => p.slot === slot)!;
const cx = (p: { x: number }) => p.x + PLAYER_W / 2;
const feet = (p: { y: number }) => p.y + PLAYER_H;
// walk to the middle of the goal zone and stop there (the level is cleared when everybody is inside at once)
const toGoal = (snap: WorldSnap, p: { x: number }): BotOut => {
  const g = snap.goal;
  const d = g ? g.x + g.w / 2 - cx(p) : 1;
  return Math.abs(d) < 10 ? idle : { ...idle, x: d > 0 ? 1 : -1 };
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// 4. balance: a ledge, two plates flush with it (D, E) over a shaft, another ledge with the goal. Slot 0 stands on D alone: D goes down, E comes up, the rider goes along.
function balance(): Scenario {
  const rows = room(40, 24);
  for (let y = 17; y <= 21; y++) {
    cell(rows, 1, y, '#######');
    cell(rows, 18, y, '#'.repeat(21));
  } // ledges (top at row 17), a shaft between them
  cell(rows, 8, 17, 'DDDD');
  cell(rows, 14, 17, 'EEEE'); // the plates, flush with the ledges
  cell(rows, 2, 16, 'S');
  cell(rows, 36, 16, 'G');
  const level = base('b-balance', rows, {
    tether: 'freeOnly',
    params: { D: { kind: 'balance', partner: 'E', travel: 3, speed: 1 }, E: { kind: 'balance', partner: 'D', travel: 3, speed: 1 } },
  });
  return {
    id: 'balance',
    level,
    mode: 'free',
    world: 'forest',
    maxSec: 12,
    make: () => (slot, snap) => {
      const p = me(snap, slot);
      if (slot === 0) return cx(p) < 9.5 * TILE ? { ...idle, x: 1 } : idle; // walks onto D (cols 8-11) and stands there
      return idle;
    },
  };
}

// 5. target: a gate across the way (A, col 30), the diana in the air before it (a, cols 20-21 rows 10-11). Slot 0 jumps through it; both then run through the open gate.
function target(): Scenario {
  const rows = room(40, 16);
  for (let y = 9; y <= 13; y++) cell(rows, 30, y, 'A');
  cell(rows, 20, 10, 'aa');
  cell(rows, 20, 11, 'aa');
  cell(rows, 2, 13, 'S');
  cell(rows, 36, 13, 'G');
  const level = base('b-target', rows, { tether: 'freeOnly', params: { a: { kind: 'target', opens: 'A' }, A: { kind: 'gate' } } });
  return {
    id: 'target',
    level,
    mode: 'free',
    world: 'forest',
    maxSec: 25,
    make: () => {
      let hit = false;
      return (slot, snap) => {
        const p = me(snap, slot);
        const open = snap.objects.find((o) => o.letter === 'A')?.open ?? false;
        if (open) hit = true;
        if (slot === 0) {
          if (hit) return { ...idle, x: 1 };
          if (cx(p) < 18.2 * TILE) return { ...idle, x: 1 };
          return { ...idle, x: 1, jump: p.grounded }; // runs through the jump: crosses the diana in the air
        }
        // slot 1 waits in front of the gate until it is open, then runs for the goal
        if (!hit) return cx(p) < 27 * TILE ? { ...idle, x: 1 } : idle;
        return { ...idle, x: 1 };
      };
    },
  };
}

// 6. soft enemies: two beetles patrol the floor in front of the goal; the bots (walls, gaps, tower) walk through them, get shoved and never die
function enemies(): Scenario {
  const rows = room(40, 16);
  cell(rows, 2, 13, 'S');
  cell(rows, 36, 13, 'G');
  const level = base('b-enemies', rows, {
    tether: 'freeOnly',
    enemies: [
      { x: 16, y: 13, range: 3 },
      { x: 26, y: 13, range: 3 },
    ],
  });
  return { id: 'enemies', level, mode: 'free', world: 'forest', maxSec: 60, make: withBots };
}

// 7. ice: the middle of the way is an ice sheet with a wall at the end of it (the bots must brake and jump on a slippery floor)
function ice(): Scenario {
  const rows = room(50, 16);
  cell(rows, 14, 14, 'I'.repeat(24));
  for (let y = 11; y <= 13; y++) cell(rows, 40, y, '#');
  cell(rows, 2, 13, 'S');
  cell(rows, 46, 13, 'G');
  const level = base('b-ice', rows, { tether: 'freeOnly' });
  return { id: 'ice', level, mode: 'free', world: 'glacier', maxSec: 60, make: withBots };
}

// 8. wind: a 3-tile gap, the gusts push whoever jumps over it (1 s of every 3), the bots keep trying until both are across
function wind(): Scenario {
  const rows = room(40, 16);
  for (let y = 14; y < 16; y++) cell(rows, 18, y, '...');
  cell(rows, 18, 15, '~~~');
  cell(rows, 2, 13, 'S');
  cell(rows, 36, 13, 'G');
  const level = base('b-wind', rows, { tether: 'freeOnly', wind: { dir: -1, periodSec: 3, gustSec: 1 } });
  return { id: 'wind', level, mode: 'free', world: 'glacier', maxSec: 90, make: withBots };
}

// 9. pickaxe: a 5-tile ice wall (rows 9-13, ice on its left face) glued to rock, the pickaxe at col 8, tied. Slot 0 takes it and climbs; on top it hands it down the rope (B, B to plant);
// slot 1 climbs the same wall; slot 0 lets go and they walk to the goal.
function pickaxe(): Scenario {
  const rows = room(40, 16);
  for (let y = 9; y <= 13; y++) {
    cell(rows, 20, y, 'I');
    cell(rows, 21, y, '####');
  }
  cell(rows, 2, 13, 'S');
  cell(rows, 8, 13, 'p');
  cell(rows, 36, 13, 'G');
  const level = base('b-pick', rows, { tether: 'chainOnly' });
  const wall = 20 * TILE - PLAYER_W;
  return {
    id: 'pickaxe',
    level,
    mode: 'chain',
    world: 'glacier',
    maxSec: 60,
    make: () => {
      let passed = 0,
        lastB = -99; // passed: 0 fetching and climbing, 1 handed down, 2 planted, 3 stood up again
      return (slot, snap, f) => {
        const k = snap.pickaxes[0]!;
        const a = me(snap, 0),
          b = me(snap, 1);
        const onTop = (p: typeof a) => p.grounded && feet(p) <= 9 * TILE + 1 && cx(p) > 20 * TILE;
        const above = (p: typeof a) => feet(p) <= 9 * TILE + 24 && cx(p) > 20 * TILE; // up on the wall, however it stands
        if (slot === 0) {
          if (passed === 0) {
            // fetch, climb, hand it down
            if (k.heldBy !== 0) return cx(a) < 8 * TILE ? { ...idle, x: 1 } : idle;
            if (!onTop(a)) return cx(a) < wall ? { ...idle, x: 1 } : { ...idle, x: 1, y: -1 };
            passed = 1;
            lastB = f;
            return { ...idle, grab: true }; // B: passes the pickaxe down the rope
          }
          if (passed === 1 && f - lastB >= 3) {
            passed = 2;
            lastB = f;
            return { ...idle, grab: true };
          } // B again: plants, an anchor
          if (passed === 2 && above(b)) {
            passed = 3;
            lastB = f;
            return { ...idle, grab: true };
          } // the partner is up: B stands up
          return passed === 3 ? { ...idle, x: 1 } : idle;
        }
        if (k.heldBy !== 1) return cx(b) < cx(a) - 2 * TILE ? { ...idle, x: 1 } : idle; // follows its partner without the pickaxe
        if (above(b)) return { ...idle, x: 1 };
        return { ...idle, x: 1, y: -1 }; // towards the wall, UP: clings, climbs, mantles
      };
    },
  };
}

// 10. throw niche: a 5-tile pit (liquid 9 tiles down, deep enough for the pulled thrower) between two floors, tied. Slot 0 lifts slot 1 and throws it across; slot 1 plants, then
// stands up and walks off; slot 0 is hauled up the far face; both run to the goal.
function throwNiche(): Scenario {
  const rows = room(50, 24);
  for (let y = 15; y < 22; y++) {
    cell(rows, 1, y, '#'.repeat(12));
    cell(rows, 18, y, '#'.repeat(31));
  } // floors at row 15; the pit is cols 13-17
  for (let y = 22; y < 24; y++) cell(rows, 13, y, '~~~~~'); // liquid 7 tiles under the ledges: the pulled thrower hangs ~4 tiles below the far ledge
  cell(rows, 2, 14, 'S');
  cell(rows, 46, 14, 'G');
  const level = base('b-throw', rows, { tether: 'chainOnly', biome: 'beach' });
  return {
    id: 'throw',
    level,
    mode: 'chain',
    world: 'beach',
    maxSec: 60,
    make: () => {
      let phase = 0,
        t = 0,
        lifted = -1;
      const edge = 13 * TILE;
      return (slot, snap, f) => {
        const a = me(snap, 0),
          b = me(snap, 1);
        const over = cx(b) > 18 * TILE && b.grounded; // slot 1 landed on the far floor
        if (phase === 0) {
          // gather at the edge: slot 0 right at it facing right, slot 1 beside it
          if (slot === 0) {
            if (cx(a) < edge - 8) return { ...idle, x: 1 };
            if (a.grounded && b.grounded && Math.abs(cx(b) - cx(a)) < 44 && Math.abs(a.vx) < 1 && Math.abs(b.vx) < 1) {
              phase = 1;
              t = f;
              return { ...idle, x: 1, grab: true };
            }
            return idle;
          }
          return cx(b) < edge - 40 ? { ...idle, x: 1 } : idle;
        }
        if (phase === 1) {
          // lifted: throw it three frames later
          if (slot === 0) {
            if (lifted < 0 && a.holding?.kind === 'player') lifted = f;
            if (lifted >= 0 && f - lifted >= 3) {
              phase = 2;
              t = f;
              return { ...idle, x: 1, grab: true };
            }
            return idle;
          }
          return idle;
        }
        if (phase === 2) {
          // in flight: slot 1 plants as soon as it is down on the far side
          if (slot === 1 && over) {
            phase = 3;
            t = f;
            return { ...idle, grab: true };
          }
          if (f - t > 240) phase = 3;
          return idle;
        }
        if (phase === 3) {
          // let the thrower dangle a moment, then slot 1 un-plants and walks away; slot 0 is hauled up
          if (slot === 1) {
            if (f - t === 40) return { ...idle, grab: true };
            return f - t > 40 ? { ...idle, x: 1 } : idle;
          }
          if (a.grounded && cx(a) > 18 * TILE) phase = 4; // hauled up
          return idle;
        }
        return toGoal(snap, slot === 0 ? a : b);
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// A6 (dynamics 10-12).
// 10. lantern: a dark level. The lantern lies at col 6; a 6-tile pit (liquid under it, row 15) is bridged by crystals at floor level (row 14, cols 15-20): they are solid only while the
// light is within 4 tiles. Slot 0 takes the lantern and walks across with slot 1 close behind it (a follower farther than the circle would fall: the bots keep within 3 tiles).
function lantern(): Scenario {
  const rows = room(40, 16);
  cell(rows, 15, 14, 'YYYYYY');
  cell(rows, 15, 15, '~~~~~~');
  cell(rows, 2, 13, 'S');
  cell(rows, 6, 13, 'l');
  cell(rows, 36, 13, 'G');
  const level = base('b-lantern', rows, { tether: 'freeOnly', biome: 'mine' });
  return {
    id: 'lantern',
    level,
    mode: 'free',
    world: 'mine',
    maxSec: 40,
    make: () => {
      let taken = false;
      return (slot, snap) => {
        const p = me(snap, slot),
          q = me(snap, 1 - slot);
        const k = snap.lanterns[0];
        if (!k) return toGoal(snap, p); // quick match: no lantern, the crystals are air: they walk into the pit
        if (slot === 0) {
          if (!taken) {
            if (k.heldBy === 0) taken = true;
            return cx(p) < 6.5 * TILE ? { ...idle, x: 1 } : idle;
          }
          if (cx(q) < cx(p) - 3 * TILE) return idle; // waits for the follower
          return toGoal(snap, p);
        }
        if (!taken || cx(p) > cx(q) - 1.5 * TILE) return idle; // stays 1.5 tiles behind the light
        return { ...idle, x: 1 };
      };
    },
  };
}

// 11. bungee: a pillar (cols 4-12, top at row 10) with an elastic ring above its edge (col 9, row 8), a deep drop to its right. Slot 0 stands at the ring and anchors (B); slot 1 walks off the
// edge and falls: the rope stretches to 1.6x, bounces it, then it hangs. Slot 0 lets go after a while; both are on their own again.
function bungee(): Scenario {
  const rows = room(40, 24);
  for (let y = 10; y <= 21; y++) cell(rows, 1, y, '#'.repeat(12)); // the pillar (cols 1-12), top at row 10
  cell(rows, 9, 8, 'u');
  cell(rows, 2, 9, 'S');
  cell(rows, 36, 21, 'G');
  const level = base('b-bungee', rows, { tether: 'chainOnly', biome: 'mine' });
  return {
    id: 'bungee',
    level,
    mode: 'chain',
    world: 'mine',
    maxSec: 20,
    make: () => {
      let anchored = false;
      return (slot, snap) => {
        const p = me(snap, slot);
        if (slot === 0) {
          if (p.anchored) {
            anchored = true;
            return idle;
          }
          if (cx(p) < 9.2 * TILE) return { ...idle, x: 1 };
          return { ...idle, grab: p.grounded && !anchored }; // B at the ring
        }
        if (!anchored) return cx(p) < 7 * TILE ? { ...idle, x: 1 } : idle; // waits near it
        return { ...idle, x: 1 }; // walks off the edge
      };
    },
  };
}

// 12a. sinkers: two rocks over a lava pit; both players spawn on the first one (it sinks 1 tile/s with two on it, travel 3).
function sinkers(): Scenario {
  const rows = room(40, 18);
  for (let y = 16; y <= 17; y++) cell(rows, 12, y, '~'.repeat(16));
  cell(rows, 13, 12, 'DDDD');
  cell(rows, 22, 12, 'EEEE');
  cell(rows, 14, 11, 'S');
  cell(rows, 36, 15, 'G');
  const level = base('b-sink', rows, {
    tether: 'freeOnly',
    biome: 'volcano',
    params: { D: { kind: 'sinker', travel: 3 }, E: { kind: 'sinker', travel: 3 } },
  });
  return { id: 'sinkers', level, mode: 'free', world: 'volcano', maxSec: 12, make: () => () => idle };
}

// 12b. geyser: a vent in the floor (col 20), period 4 s. Both players spawn in it; the first eruption throws them up (they can steer to a ledge of 6 tiles on the right).
function geyser(): Scenario {
  const rows = room(40, 18);
  for (let y = 9; y <= 15; y++) cell(rows, 25, y, '#'.repeat(14)); // a ledge-block on the right, top at row 9 (6 tiles above the floor row 15 standing... floor top row 16)
  cell(rows, 20, 15, 'E');
  cell(rows, 20, 15, 'E');
  cell(rows, 20, 15, 'E');
  cell(rows, 2, 15, 'S');
  cell(rows, 36, 8, 'G');
  const level = base('b-geyser', rows, {
    tether: 'freeOnly',
    biome: 'volcano',
    params: { E: { kind: 'geyser', periodSec: 4, activeSec: 0.5 } },
  });
  return {
    id: 'geyser',
    level,
    mode: 'free',
    world: 'volcano',
    maxSec: 30,
    make: () => (slot, snap) => {
      const p = me(snap, slot);
      const vent = 20.5 * TILE;
      if (p.y + PLAYER_H > 14 * TILE && p.grounded && cx(p) < vent - 4) return { ...idle, x: 1 }; // walks into the vent and waits for the eruption
      if (!p.grounded) return { ...idle, x: cx(p) < 25.5 * TILE ? 1 : 0 }; // steers towards the ledge in the air
      return cx(p) > 25 * TILE ? toGoal(snap, p) : idle;
    },
  };
}

// Layer for 2 (captures of A6: shared hearts, the long rope, a signal over the head): tied in the forest world. Slot 0 waits at col 10; slot 1 walks right into a spike patch (cols 14-15):
// it dies, flies back to its partner in a bubble and a heart is spent.
function layer(): Scenario {
  const rows = room(40, 16);
  cell(rows, 14, 13, '^^');
  cell(rows, 2, 13, 'S');
  cell(rows, 36, 13, 'G');
  const level = base('b-layer', rows, { tether: 'chainOnly', biome: 'forest' });
  return {
    id: 'layer',
    level,
    mode: 'chain',
    world: 'forest',
    maxSec: 30,
    make: () => (slot, snap) => {
      const p = me(snap, slot);
      if (slot === 0) return cx(p) < 10 * TILE ? { ...idle, x: 1 } : idle;
      return cx(p) < 10 * TILE - 40 ? { ...idle, x: 1 } : snap.tick > 300 ? { ...idle, x: 1 } : idle; // waits, then walks into the spikes after 5 s
    },
  };
}

export const SCENARIOS: Record<string, () => Scenario> = {
  balance,
  target,
  enemies,
  ice,
  wind,
  pickaxe,
  throw: throwNiche,
  lantern,
  bungee,
  sinkers,
  geyser,
  layer,
};
