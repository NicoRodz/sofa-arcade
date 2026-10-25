// A module is a self-contained slice of level: 18 rows high, flat ground (standing row GROUND_ROW) on both ends, so any two
// modules can be glued side by side. Letters a-f / A-F are LOCAL: the assembler renames them so two modules never clash.
import type { EntityParam, Tether } from '../types';

export const MODULE_ROWS = 18;
export const GROUND_ROW = 14; // standing row at the left and right edge of every module (floor top is row 15)

export interface LevelModule {
  id: string;
  name: string;
  w: number;
  rows: string[]; // MODULE_ROWS strings of length w, no outer walls
  params?: Record<string, EntityParam>;
  minPlayers: number;
  maxPlayers?: number;
  tether: Tether; // 'any' = must hold in both modes (a ring module carries '%' stones for Libres)
  coop: boolean; // needs teammates (tower, hand, plate, lever, ring, key)
  timing?: boolean;
}
