// Campaign level metadata (plan "Obstaculos en cadena: campana y profundizacion", §2, §7). The tilemap is frozen in a LevelDef; this wraps it with
// what the learning test and the map need: where it sits, what it teaches (`introduces`), what it relies on (`requires`), the recommended mode.
import type { Mechanic } from '../mechanics';
import type { Biome, Cell, LevelDef } from '../types';

import type { WorldId } from '../sim/campaign'; // 'beach' | 'forest' | 'glacier' | 'mine' | 'volcano' | 'summit' (Cumbres)
export type CampaignMode = 'E' | 'L' | 'E/L'; // Encadenados, Libres, either
export type LevelStatus = 'built' | 'planned'; // planned: metadata only, the tilemap comes with its phase (A5, A6, A7)

export interface CampaignLevel {
  id: string; // '1-1' .. '5-7', 'C1' .. 'C5'
  world: WorldId;
  index: number; // 1..7 inside the world (1..5 for the Cumbres)
  order: number; // 1..40 in campaign order
  name: string;
  biome: Biome;
  boss: boolean;
  introduces: Mechanic[]; // taught here for the first time (verified at the debut by the learning test where the validator models it)
  requires: Mechanic[]; // used here, taught earlier
  mode: CampaignMode;
  origin: 'new' | 'relocate'; // plan table: N = new, R? = an existing level may take the slot
  candidate?: string; // existing level (l01..l15) that passes the relocation rule for this slot
  status: LevelStatus;
  def?: LevelDef; // built levels
  collectibles: Cell[]; // the 3 stars of the tilemap (built levels)
  validatedFor: number[]; // player counts the CI validated (N=2 for now)
  note?: string; // deviation from the plan table, for the next reader
}

export interface PracticeStation {
  id: string;
  name: string;
  mechanics: Mechanic[]; // what the station trains
  requires: Mechanic[]; // what the bot of the station's test also knows (e.g. the hand, to follow a throw)
  opensAt: string; // campaign level id: the station opens when that level debuts its mechanic
  mode: CampaignMode;
  def: LevelDef; // G is the target ring; no hearts
  hearts: 'infinite';
  silhouette: true; // the ghost that demonstrates the action (drawn by the screen)
}
