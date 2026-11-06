// Scenarios of the A6 dynamics (10-12) for the two-bot tests (obst.dynamics.ws.test.ts).

import { PLAYER_H, TILE } from '..';
import { type Scenario, idle, cell, room, base, me, cx, toGoal } from './obst.dynamics.kit';

// A6 (dynamics 10-12).
// 10. lantern: a dark level. The lantern lies at col 6; a 6-tile pit (liquid under it, row 15) is bridged by crystals at floor level (row 14, cols 15-20): they are solid only while the
// light is within 4 tiles. Slot 0 takes the lantern and walks across with slot 1 close behind it (a follower farther than the circle would fall: the bots keep within 3 tiles).
export function lantern(): Scenario {
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
export function bungee(): Scenario {
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
export function sinkers(): Scenario {
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
export function geyser(): Scenario {
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
export function layer(): Scenario {
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
