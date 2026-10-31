// Gate (Z plate + D door), shared reads: where the plates and doors are, who stands on them, whether the door is open. Implemented by T1b.
import type { Game, Player } from '../../round/state';
import { hz3Params } from '../../hazards/hazard-v3';

export const GATE_OPEN_TICKS = 480; // timer mode (a D with no Z in the map): open 8 s...
export const GATE_CLOSED_TICKS = 360; // ...closed 6 s
export const GATE_BLINK_TICKS = 60; // the door blinks this long before it closes
export const GATE_CYCLE = GATE_OPEN_TICKS + GATE_CLOSED_TICKS;
/** The timer door's numbers of this round (HAZARD_V3 changes them; the legacy row is the constants above). */
export const gateOpenTicks = (g: Game): number => hz3Params(g).gate.open;
export const gateCycleTicks = (g: Game): number => hz3Params(g).gate.open + hz3Params(g).gate.closed;
/** Is the door on tile index `idx` open now? Plate mode: the one state. Timer mode: the shared clock, shifted `offset` ticks per door in map order (HAZARD_V3 staggers them by 3 s). */
export function doorOpenAt(g: Game, idx: number): boolean {
  const gs = g.mech!.gate!,
    m = gateMap(g),
    off = hz3Params(g).gate.offset;
  if (!m.timer || !off) return gs.open;
  const i = Math.max(0, m.doors.indexOf(idx));
  return (gs.phase + i * off) % gateCycleTicks(g) < gateOpenTicks(g);
}
export const gateBlinkTicks = (g: Game): number => hz3Params(g).gate.warn;

export interface GateMap {
  plates: number[]; // tile index y * 16 + x of every Z
  doors: number[]; // ... of every D
  timer: boolean; // no Z in the map: the door runs on the clock
}
export const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * 16 + Math.floor(p.x); // index of the tile under a body

/** The map scan done in onLoad, kept in game.mech.ext (it never changes in a round). */
export function scan(g: Game): GateMap {
  const m: GateMap = { plates: [], doors: [], timer: false };
  g.grid.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind !== 'floor') return;
      if (t.mech === 'Z') m.plates.push(y * 16 + x);
      else if (t.mech === 'D') m.doors.push(y * 16 + x);
    }),
  );
  m.timer = m.plates.length === 0;
  return m;
}
export const gateMap = (g: Game): GateMap => g.mech!.ext!.gate as GateMap;

/** Is a chef (not a dropped one) standing on any of these tiles? Centre of the body, like every tile rule of the sim. */
export const standingOn = (g: Game, tiles: readonly number[]): Player | undefined => {
  for (const p of g.players.values()) if (!p.ghost && tiles.includes(tileOf(p))) return p;
  return undefined;
};
export const isDoor = (g: Game, tx: number, ty: number): boolean => {
  const t = g.grid[ty]?.[tx];
  return t?.kind === 'floor' && t.mech === 'D';
};
