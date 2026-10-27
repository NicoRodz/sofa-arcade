// State and geometry of the kneader (M): progress in permil of a tick, who holds each handle, the call for the missing chef.
// The handles are the pair of opposite floor neighbours of M; progress is kept on the station (`game.mech.kneader[idx]`), so letting go loses nothing.
import type { Game, Player, Station } from '../../round/state';

export const GOAL = 150_000; // 150 ticks of two chefs, in permil
export const PAIR = 1000; // permil of a tick a pair gives
export const SOLO = 350; // a chef alone: x0.35 (decision of Nico: never impossible with 2)
export const NEED_AFTER = 60; // ticks alone on a handle before another chef is called (once per stretch: a lone chef finishes in 429 ticks)

interface Ext {
  handles: Record<number, [number, number][]>;
  alone: Record<number, number>;
}
const ext = (g: Game) => g.mech!.ext!.kneader as Ext;

export const startExt = (g: Game) => {
  g.mech!.ext = { ...g.mech!.ext, kneader: { handles: {}, alone: {} } satisfies Ext };
};
/** The two tiles a chef stands on to work M: left-right first, then up-down; none when no pair of opposite floor tiles exists. */
export function scanHandles(g: Game, s: Station): [number, number][] {
  const floor = (x: number, y: number) => g.grid[y]?.[x]?.kind === 'floor';
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
  ] as const)
    if (floor(s.tx - dx, s.ty - dy) && floor(s.tx + dx, s.ty + dy))
      return [
        [s.tx - dx, s.ty - dy],
        [s.tx + dx, s.ty + dy],
      ];
  return [];
}
export const setHandles = (g: Game, idx: number, h: [number, number][]) => void (ext(g).handles[idx] = h);
export const handlesOf = (g: Game, idx: number): [number, number][] => ext(g).handles[idx] ?? [];
/** 0 or 1 when the chef stands on that handle of M, -1 otherwise. */
export const handleOf = (g: Game, idx: number, p: Player): number =>
  handlesOf(g, idx).findIndex(([x, y]) => x === Math.floor(p.x) && y === Math.floor(p.y));
export const aloneTicks = (g: Game, idx: number) => ext(g).alone[idx] ?? 0;
export const setAlone = (g: Game, idx: number, v: number) => void (ext(g).alone[idx] = v);

/** The kneader slice of a station, or undefined when the station is not an M of this round. */
export const slot = (g: Game, s: Station | null) => (s && s.kind === 'kneader' ? g.mech?.kneader?.[g.stations.indexOf(s)] : undefined);
/** Is M in the middle of a dough (a ball on it that is not done)? */
export const kneading = (s: Station) => s.item === 'raw0';
