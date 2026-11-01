// Art of 'raft' (drawn by code): the raft is a set of logs tied with rope sliding along its lane, a little bobbing; the lane shows as a dotted line of ripples on the water so people can read where it goes, and Implemented by T1c.
// an arrow on the raft says which way it is heading. The background paints the whole lane as water (world.ts).
import type { MechArt } from '../../../../sim/mech/types';
import { raftCap, raftPause } from '../../../../sim/mech/raft/module';
import { TILE } from '@pichi/screen-kit/art';
import { OX, OY } from '../../env/grid';
import { layer, type Draw } from '../layer';

const COL = { log: 0xc98a4b, log2: 0x9c6232, rope: 0xe8c9a0, ripple: 0xcff1ff, arrow: 0xffd23f };

export const drawRafts: Draw = (scene, g, t) => {
  const gfx = layer(scene, 'raft', 1.52);
  gfx.clear();
  const lanes = g.mech?.ext?.rafts as { tiles: number[]; dx: number; dy: number }[] | undefined;
  if (!lanes) return;
  lanes.forEach((lane, li) => {
    const r = g.mech!.raft![li]!;
    for (const [n, i] of lane.tiles.entries()) {
      if (n === r.pos) continue;
      const cx = OX + ((i % 16) + 0.5) * TILE,
        cy = OY + (Math.floor(i / 16) + 0.5) * TILE;
      gfx.fillStyle(COL.ripple, 0.5 + 0.2 * Math.sin(t / 400 + n)).fillCircle(cx, cy, TILE * 0.05);
    }
    const i = lane.tiles[r.pos]!;
    const x = OX + (i % 16) * TILE,
      y = OY + Math.floor(i / 16) * TILE + Math.sin(t / 350 + li) * TILE * 0.012;
    const logs = 4;
    for (let p = 0; p < logs; p++) {
      const o = TILE * (0.14 + (0.72 * p) / (logs - 1));
      if (lane.dx)
        gfx
          .fillStyle(p % 2 ? COL.log : COL.log2, 1)
          .fillRoundedRect(x + TILE * 0.06, y + o - TILE * 0.09, TILE * 0.88, TILE * 0.18, TILE * 0.08);
      else
        gfx
          .fillStyle(p % 2 ? COL.log : COL.log2, 1)
          .fillRoundedRect(x + o - TILE * 0.09, y + TILE * 0.06, TILE * 0.18, TILE * 0.88, TILE * 0.08);
    }
    gfx.lineStyle(4, COL.rope, 1);
    if (lane.dx)
      gfx
        .lineBetween(x + TILE * 0.3, y + TILE * 0.1, x + TILE * 0.3, y + TILE * 0.9)
        .lineBetween(x + TILE * 0.7, y + TILE * 0.1, x + TILE * 0.7, y + TILE * 0.9);
    else
      gfx
        .lineBetween(x + TILE * 0.1, y + TILE * 0.3, x + TILE * 0.9, y + TILE * 0.3)
        .lineBetween(x + TILE * 0.1, y + TILE * 0.7, x + TILE * 0.9, y + TILE * 0.7);
    // HAZARD_V3: the seats (the raft holds `raftCap` chefs): a mark per seat on the raft's east edge (on the logs the chefs would hide them), filled while a chef sits on it
    const cap = raftCap(g);
    if (cap > 0) {
      const aboard = [...g.players.values()].filter((p) => !p.ghost && Math.floor(p.y) * 16 + Math.floor(p.x) === i).length;
      for (let k = 0; k < cap; k++) {
        const o = TILE * (0.3 + (0.4 * k) / Math.max(1, cap - 1)),
          sx = x + TILE * 1.2,
          sy = y + o,
          taken = k < aboard;
        gfx.fillStyle(0x2b1b17, 0.55).fillCircle(sx, sy, TILE * 0.16);
        gfx.lineStyle(4, taken ? 0x6fd36f : 0xfff1d6, 0.95).strokeCircle(sx, sy, TILE * 0.16);
        if (taken) gfx.fillStyle(0x6fd36f, 0.8).fillCircle(sx, sy, TILE * 0.08);
      }
    }
    // heading arrow (hidden while it waits at the shore: then it blinks)
    const wait = r.wait > 0 && (r.pos === 0 || r.pos === lane.tiles.length - 1) && r.wait <= raftPause(g);
    if (!wait || Math.floor(t / 200) % 2 === 0) {
      const ax = x + TILE / 2,
        ay = y + TILE / 2,
        d = r.dir;
      const [ux, uy] = [lane.dx * d, lane.dy * d];
      gfx
        .fillStyle(COL.arrow, 0.95)
        .fillTriangle(
          ax + ux * TILE * 0.2,
          ay + uy * TILE * 0.2,
          ax - ux * TILE * 0.1 - uy * TILE * 0.14,
          ay - uy * TILE * 0.1 + ux * TILE * 0.14,
          ax - ux * TILE * 0.1 + uy * TILE * 0.14,
          ay - uy * TILE * 0.1 - ux * TILE * 0.14,
        );
    }
  });
};
export const raftArt: MechArt = { draw: drawRafts as unknown as () => void };
