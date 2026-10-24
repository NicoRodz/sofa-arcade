// Levels shipped so far. F4 adds the rest, one file per level.
import type { LevelDef } from '../types';
import { LEVEL_01 } from './level01';
import { LEVEL_04 } from './level04';
import { LEVEL_08 } from './level08';

export const LEVELS: readonly LevelDef[] = [LEVEL_01, LEVEL_04, LEVEL_08];
export { LEVEL_01, LEVEL_04, LEVEL_08 };
