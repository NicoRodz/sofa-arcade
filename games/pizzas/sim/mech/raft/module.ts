// Raft (design section 3, "Balsa ="): the '=' tile is a floor tile that slides along a straight lane of water, 40 ticks per tile, pausing 60 at each end, and carries the chefs standing on it.
// The grid itself changes (the tile it leaves becomes water, the one it reaches becomes floor), so walls, belts and the screen read it as any other tile. Implemented by T1c.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import type { Game } from '../../round/state';
import { raftValidate } from '../../validate/mech/raft';
import { raftStamp } from '../../gen/stamps/raft';

export const RAFT_STEP_TICKS = 40;
export const RAFT_PAUSE_TICKS = 60;

interface Lane {
  tiles: number[]; // tile indexes along the lane, from one shore to the other
  dx: number;
  dy: number;
}
const lanes = (g: Game) => g.mech!.ext!.rafts as Lane[];

function scanLanes(g: Game): { lanes: Lane[]; start: number[] } {
  const wet = (x: number, y: number) => {
    const t = g.grid[y]?.[x];
    return t?.kind === 'water' || (t?.kind === 'floor' && t.mech === '=');
  };
  const out: Lane[] = [],
    start: number[] = [];
  g.grid.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind !== 'floor' || t.mech !== '=') return;
      const horizontal = wet(x - 1, y) || wet(x + 1, y);
      const [dx, dy] = horizontal ? [1, 0] : [0, 1];
      let a = 0,
        b = 0;
      while (wet(x - dx * (a + 1), y - dy * (a + 1))) a++;
      while (wet(x + dx * (b + 1), y + dy * (b + 1))) b++;
      const tiles: number[] = [];
      for (let i = -a; i <= b; i++) tiles.push((y + dy * i) * 16 + x + dx * i);
      out.push({ tiles, dx, dy });
      start.push(a);
    }),
  );
  return { lanes: out, start };
}
const setTile = (g: Game, idx: number, raft: boolean) => {
  g.grid[Math.floor(idx / 16)]![idx % 16] = raft ? { kind: 'floor', spawn: false, mech: '=' } : { kind: 'water' };
};

export const raftModule: MechModule = {
  ...noopHooks,
  id: 'raft',
  tanda: 'T1c',
  validate: raftValidate,
  stamp: raftStamp,
  onLoad(g) {
    const { lanes: l, start } = scanLanes(g);
    g.mech!.ext = { ...g.mech!.ext, rafts: l, raftStart: start };
  },
  init(g) {
    const start = g.mech!.ext!.raftStart as number[];
    g.mech!.raft = Object.fromEntries(
      lanes(g).map((l, i) => [i, { pos: start[i]!, dir: start[i] === l.tiles.length - 1 ? -1 : 1, wait: RAFT_STEP_TICKS }]),
    );
  },
  beforeMove(g) {
    lanes(g).forEach((lane, i) => {
      const r = g.mech!.raft![i]!;
      if (--r.wait > 0) return;
      const from = lane.tiles[r.pos]!;
      r.pos += r.dir;
      const to = lane.tiles[r.pos]!;
      setTile(g, from, false);
      setTile(g, to, true);
      for (const p of g.players.values())
        if (!p.ghost && Math.floor(p.y) * 16 + Math.floor(p.x) === from) {
          p.x += lane.dx * r.dir; // the raft carries whoever stands on it
          p.y += lane.dy * r.dir;
        }
      const end = r.pos + r.dir < 0 || r.pos + r.dir >= lane.tiles.length;
      if (end) r.dir = -r.dir;
      r.wait = end ? RAFT_PAUSE_TICKS : RAFT_STEP_TICKS;
    });
  },
  hashExtra: (g) => Object.values(g.mech!.raft!).flatMap((r) => [r.pos, r.dir, r.wait]),
};
