// What the lobby of "Obstaculos en cadena" chooses and how it turns into an expedition (plan §1, §10, §15).
// The lobby's choices travel in the generic config as modeOptions ({ tether: 'chain' | 'free', level: 0..15 }); difficulty and seed use
// the config's own fields. Pure: the screen, the phone's label and the tests all read it.
import type { Difficulty } from '../../difficulty';
import { type ModeOptions } from '../../protocol';
import { EXPEDITION_LEVELS } from './constants';
import { LEVELS } from './levels';
import type { GameMode, LevelDef } from './types';

export interface ObstOptions { tether: GameMode; level: number } // level 0 = random (seeded); 1..15 = the expedition starts there
export const RANDOM_LEVEL = 0;
export const DEFAULT_OBST_OPTIONS: ObstOptions = { tether: 'chain', level: 1 };
export const MODE_LABEL: Record<GameMode, string> = { chain: 'Encadenados', free: 'Libres' };
export const MODE_BLURB: Record<GameMode, string> = { chain: 'Con cuerda: se tiran unos a otros', free: 'Sin cuerda: cada uno por su cuenta' };

export const isMode = (v: unknown): v is GameMode => v === 'chain' || v === 'free';

// modeOptions is opaque to the protocol: anything malformed falls back to the defaults, one field at a time.
export function parseObstOptions(o: ModeOptions | Record<string, unknown> | undefined | null): ObstOptions {
  const lvl = o?.level;
  return {
    tether: isMode(o?.tether) ? o.tether : DEFAULT_OBST_OPTIONS.tether,
    level: typeof lvl === 'number' && Number.isInteger(lvl) && lvl >= 0 && lvl <= LEVELS.length ? lvl : DEFAULT_OBST_OPTIONS.level,
  };
}
export const toModeOptions = (o: ObstOptions): ModeOptions => ({ tether: o.tether, level: o.level });

export const tetherAllows = (def: LevelDef, mode: GameMode): boolean => def.tether === 'any' || (def.tether === 'chainOnly' ? mode === 'chain' : mode === 'free');

export type Compat = { ok: true; reason: '' } | { ok: false; reason: string };
// "The selector hides the incompatible levels" (plan §10): with 2 players 11 remain; with 8 in Encadenados, 12.
export function levelCompat(def: LevelDef, n: number, mode: GameMode): Compat {
  if (n < def.players.min) return { ok: false, reason: `necesita al menos ${def.players.min} jugadores` };
  if (n > def.players.max) return { ok: false, reason: `admite hasta ${def.players.max} jugadores` };
  if (!tetherAllows(def, mode)) return { ok: false, reason: def.tether === 'chainOnly' ? 'solo en Encadenados' : 'solo en Libres' };
  return { ok: true, reason: '' };
}
export const compatibleLevels = (n: number, mode: GameMode): LevelDef[] => LEVELS.filter((l) => levelCompat(l, n, mode).ok);

// The level the lobby really uses: the choice when it fits, else the next one that does (then the previous), else random.
export function resolveLevel(level: number, n: number, mode: GameMode): number {
  if (level === RANDOM_LEVEL) return RANDOM_LEVEL;
  const ok = (i: number) => levelCompat(LEVELS[i - 1]!, n, mode).ok;
  for (let i = level; i <= LEVELS.length; i++) if (ok(i)) return i;
  for (let i = level - 1; i >= 1; i--) if (ok(i)) return i;
  return RANDOM_LEVEL;
}

// A fixed expedition: the chosen level and the next compatible ones, up to EXPEDITION_LEVELS ("desde el nivel X": near the end it is shorter).
export function fixedExpedition(level: number, n: number, mode: GameMode): LevelDef[] {
  const from = resolveLevel(level, n, mode);
  if (from === RANDOM_LEVEL) return [];
  return LEVELS.slice(from - 1).filter((l) => levelCompat(l, n, mode).ok).slice(0, EXPEDITION_LEVELS);
}

// Lobby line under the setup, also what the phones show.
export function setupLabel(o: ObstOptions, difficulty: Difficulty, seed: number, diffLabel: Record<Difficulty, string>): string {
  const where = o.level === RANDOM_LEVEL ? `Aleatorio ${seed}` : `Desde el nivel ${o.level}`;
  return `${diffLabel[difficulty]} · ${MODE_LABEL[o.tether]} · ${where}`;
}
