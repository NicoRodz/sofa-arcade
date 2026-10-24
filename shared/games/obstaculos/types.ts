// Level format (plan §9). Coordinates in LevelDef are tiles: column x from the left, row y from the top (row 0 is the top).
export const BIOMES = ['beach', 'forest', 'mine', 'glacier', 'volcano'] as const; // Playa, Bosque valdiviano, Mina del norte, Glaciar, Volcan
export type Biome = (typeof BIOMES)[number];

export type Weight = number | 'half-up' | 'half-down' | 'all' | 'all-but-1';
export type EntityParam =
  | { kind: 'plate'; weight: Weight; opens: string; latch: boolean }
  | { kind: 'lever'; opens: string; latch: boolean }
  | { kind: 'target'; opens: string } // campaign dynamic 5 (diana): an activator letter a-f; touched in flight it opens `opens` for CampaignParams.targetSec
  | { kind: 'gate' }
  | { kind: 'ladder' }
  | { kind: 'mover'; dx: number; dy: number; periodSec: number }
  | { kind: 'balance'; partner: string; travel: number; speed: number }
  // Campaign dynamic 12. An objective letter A-F whose cells are the rock (a one-way platform like a balance plate): it sinks CampaignParams.sinkTilesPerSec per character
  // standing on it, down to `travel` tiles, and floats back up when nobody is on it. Needs a campaign world (inert in a quick match).
  | { kind: 'sinker'; travel: number }
  // Campaign dynamic 12. An objective letter A-F whose cells are the vent (open air standing on a floor): every `periodSec` it bubbles for geyserWarnSec, then erupts for
  // `activeSec` (default 0.5 s, the last part of the period) and launches whoever is inside the vent at CampaignParams.geyserLaunchMult x the jump speed.
  | { kind: 'geyser'; periodSec: number; activeSec?: number };

export interface Rect { x: number; y: number; w: number; h: number }
export type Tether = 'any' | 'chainOnly' | 'freeOnly';
export type GameMode = 'chain' | 'free'; // Encadenados (cordadas) / Libres (Pico Park style)
export interface Hazard { kind: 'risingLava' | 'tide' | 'avalanche'; speed: number }
// Campaign dynamic 8 (viento): a gust of `gustSec` blows every `periodSec` (the last `gustSec` of each period), announced 1 s before; it pushes whoever is
// in the air (so also the hangers of a rope) towards `dir`. `zone` (tiles) limits it; absent = the whole level.
export interface WindDef { dir: -1 | 1; periodSec: number; gustSec: number; zone?: Rect }
// Campaign dynamic 6 (enemigos suaves): a soft beetle that spawns standing on the bottom of cell (x, y) and patrols +-`range` tiles around x.
export interface EnemyDef { x: number; y: number; range: number }

export interface LevelDef {
  id: string;
  name: string;
  biome: Biome;
  players: { min: number; max: number };
  tether: Tether;
  cordadaMax?: 2 | 3 | 4;
  stars: 1 | 2 | 3 | 4 | 5;
  parSec: number;
  rows: string[];
  params?: Record<string, EntityParam>; // key = the activator/objective letter in the grid
  hazard?: Hazard;
  cameraZones?: Rect[];
  wind?: WindDef; // campaign only (sim/campaignrules.ts stepWind)
  enemies?: EnemyDef[]; // campaign only (sim/enemies.ts)
  hints?: { x: number; y: number; text: string }[];
}

export interface Cell { x: number; y: number }
