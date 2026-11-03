// What the music does in each moment of the round, from the sim's state. Pure: no audio here.
// The three round files share tempo and length and are started together; only their volumes move.
//   Opening                                -> base      (round-base)
//   Scramble, and the Final until 10 s left -> mid       (round-30s)
//   the last 10 s (the hidden scoreboard is decided at exactly that moment) -> final (round-final10)
// A round without the acts (ph null) falls back on the clock: 30 s left -> mid, 10 s left -> final. The Hourglass's extra time moves the end, so the layer can go back down.
import type { AudioFile } from './files';

export type Layer = 'base' | 'mid' | 'final';
export const LAYERS: readonly Layer[] = ['base', 'mid', 'final'];
export const LAYER_FILES: Record<Layer, AudioFile> = { base: 'round-base', mid: 'round-30s', final: 'round-final10' };
export const TICK_HZ = 60;
export const MID_LEFT_TICKS = 30 * TICK_HZ;
export const FINAL_LEFT_TICKS = 10 * TICK_HZ;

export interface RoundClock {
  grid: { tick: number; durationTicks: number };
  match: { ph: { phase: 'opening' | 'scramble' | 'final'; hidden: boolean | null } | null };
}

export function layerOf(s: RoundClock): Layer {
  const left = s.grid.durationTicks - s.grid.tick;
  const ph = s.match.ph;
  if (ph) {
    if (ph.hidden !== null || left <= FINAL_LEFT_TICKS) return 'final';
    return ph.phase === 'opening' ? 'base' : 'mid';
  }
  return left <= FINAL_LEFT_TICKS ? 'final' : left <= MID_LEFT_TICKS ? 'mid' : 'base';
}

/** The volume of each layer: the current one at 1, the others at 0 (the engine glides between them). */
export const layerGains = (l: Layer): Record<Layer, number> => ({
  base: l === 'base' ? 1 : 0,
  mid: l === 'mid' ? 1 : 0,
  final: l === 'final' ? 1 : 0,
});

export type Mode = 'off' | 'lobby' | 'round' | 'results';
export interface ModeInput {
  phase: string; // the shell's phase
  live: boolean; // the 3-2-1 gate is over
  over: boolean; // the round's last tick has been played (the final board is on screen)
  hasRound: boolean;
}
/** Lobby: its loop. Round: the layers, from the first live frame until the final board. Results: only the win / lose jingle (see director.ts). The rest (menu, countdown, final board): silence. */
export function modeOf(i: ModeInput): Mode {
  if (i.phase === 'lobby') return 'lobby';
  if (i.phase === 'results') return 'results';
  return i.phase === 'playing' && i.hasRound && i.live && !i.over ? 'round' : 'off';
}
