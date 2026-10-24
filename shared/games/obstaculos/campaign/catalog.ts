// The campaign: 5 worlds x 7 levels + 5 Cumbres = 40 (plan §2). Built levels carry their frozen tilemap; planned ones carry only metadata until
// their phase (Mundo 2-3: A5, Mundo 4-5: A6, Cumbres: A7). `introduces` / `requires` are checked by the learning test (learning.ts).
//
// DEVIATIONS from the plan's table, found while reconciling it with the code (details in each `note`):
//  - 1-3 teaches the tower AND the hand: with 2 players the tower is one-way (the pioneer climbs, the base cannot), so the plan's "Torre" level needs
//    the hand to be solvable. 1-4 then teaches the anchor.
//  - 1-5 (throw) is Encadenados like the plan says, but in the validator's model the throw reaches what the tower reaches (5.4 tiles, 4 tiles up):
//    no geometry makes it necessary once the tower is known. Its debut test is "without lift fails, with the throw instead of the tower passes".
import { MECHANICS, type Mechanic } from '../mechanics';
import type { Biome, Cell } from '../types';
import { C_1_1, C_1_2, C_1_3, C_1_4, C_1_5, C_1_6, C_1_7 } from './world1';
import type { WorldId } from '../sim/campaign';
import type { CampaignLevel, CampaignMode } from './types';

type Row = [id: string, name: string, introduces: Mechanic[], requires: Mechanic[], mode: CampaignMode, origin: 'new' | 'relocate', extra?: Partial<CampaignLevel>];

const BUILT = { '1-1': C_1_1, '1-2': C_1_2, '1-3': C_1_3, '1-4': C_1_4, '1-5': C_1_5, '1-6': C_1_6, '1-7': C_1_7 } as const;

// Names, mechanics and modes: the plan's §2 table. `requires` of the planned levels is a first draft (A5/A6 settle it when they build the tilemap).
const ROWS: Row[] = [
  // Playa
  ['1-1', 'Huellas', ['move', 'jump', 'coyote'], [], 'L', 'new'],
  ['1-2', 'El mosquetón', ['rope', 'signals'], ['jump'], 'E', 'new'],
  ['1-3', 'Torre de arena', ['tower', 'hand'], ['jump'], 'E', 'new', { note: 'The plan teaches the hand in 1-4; with 2 players the tower alone leaves the base behind, so the hand debuts here.' }],
  ['1-4', 'Mano amiga', ['anchor'], ['jump', 'tower', 'hand'], 'E', 'new', { note: 'Teaches only the anchor (new dynamic); the hand moved to 1-3.' }],
  ['1-5', 'Coco-pulta', ['throw'], ['jump', 'hand'], 'E', 'new', { note: 'The throw reaches what the tower reaches (see the file header): the debut test swaps the tower for the throw.' }],
  ['1-6', 'Liana', ['swing'], ['jump'], 'E', 'new'],
  ['1-7', 'Jefe: La marea', [], ['jump', 'tower', 'hand'], 'E', 'relocate', { note: 'Built new: l03 Marea alta has D 26, above the Playa band.' }],
  // Bosque
  ['2-1', 'El roble', ['ladder'], [], 'E', 'relocate'],
  ['2-2', 'Saltamontes', ['spring', 'superjump'], [], 'E', 'relocate'],
  ['2-3', 'Sube y baja', ['balance'], [], 'E', 'new'],
  ['2-4', 'La diana', ['plate', 'target'], [], 'E', 'new'],
  ['2-5', 'Guardabosques', ['key'], [], 'E/L', 'relocate'],
  ['2-6', 'Escarabajos', ['softEnemies'], [], 'L', 'new'],
  ['2-7', 'Jefe: El jabalí', [], [], 'E', 'new'],
  // Glaciar
  ['3-1', 'Lago helado', ['ice'], [], 'E', 'new'],
  ['3-2', 'Ventisca', ['wind'], [], 'E', 'new'],
  ['3-3', 'Témpanos', ['mover'], [], 'E', 'relocate'],
  ['3-4', 'El piolet', ['pickaxe'], [], 'E', 'new'],
  ['3-5', 'Grietas', [], [], 'E', 'relocate'],
  ['3-6', 'Cordada perfecta', [], [], 'E', 'relocate'],
  ['3-7', 'Jefe: Avalancha', [], [], 'E', 'relocate', { candidate: 'l12' }],
  // Mina
  ['4-1', 'El farol', ['lantern'], [], 'E', 'new'],
  ['4-2', 'Cintas', ['belt'], [], 'E', 'relocate'],
  ['4-3', 'Vagonetas', ['cart'], [], 'E', 'relocate'],
  ['4-4', 'Bungee', ['bungee'], [], 'E', 'new'],
  ['4-5', 'Galería', ['lever'], [], 'E', 'relocate'],
  ['4-6', 'Topos', [], [], 'L', 'new'],
  ['4-7', 'Jefe: Vagoneta', [], [], 'E', 'new'],
  // Volcan
  ['5-1', 'Rocas flotantes', ['sinkers'], [], 'E', 'new'],
  ['5-2', 'Géiseres', ['geyser'], [], 'E', 'new'],
  ['5-3', 'Río de lava', ['lava'], [], 'E', 'relocate'],
  ['5-4', 'Ceniza', [], [], 'E', 'relocate'],
  ['5-5', 'La forja', [], [], 'E', 'relocate'],
  ['5-6', 'Ladera ardiente', [], [], 'E', 'relocate'],
  ['5-7', 'Jefe: Erupción', [], [], 'E', 'relocate'],
  // Cumbres: harder remixes of their world (3 existing + 2 new)
  ['C1', 'Cumbre de la Playa', [], [], 'E', 'relocate'],
  ['C2', 'Cumbre del Bosque', [], [], 'E', 'relocate'],
  ['C3', 'Cumbre del Glaciar', [], [], 'E', 'relocate'],
  ['C4', 'Cumbre de la Mina', [], [], 'E', 'new'],
  ['C5', 'Cumbre del Volcán', [], [], 'E', 'new'],
];

const WORLDS = ['beach', 'forest', 'glacier', 'mine', 'volcano'] as const;
const worldOf = (id: string): WorldId => (id.startsWith('C') ? 'summit' : WORLDS[Number(id[0]) - 1]!);
const biomeOf = (w: WorldId, id: string): Biome => (w === 'summit' ? WORLDS[Number(id[1]) - 1]! : w);
const starsOf = (rows: readonly string[]): Cell[] => rows.flatMap((r, y) => [...r].flatMap((c, x) => (c === '*' ? [{ x, y }] : [])));

export const CAMPAIGN: readonly CampaignLevel[] = ROWS.map(([id, name, introduces, requires, mode, origin, extra], i) => {
  const world = worldOf(id);
  const def = (BUILT as Record<string, (typeof BUILT)[keyof typeof BUILT]>)[id];
  return {
    id, world, index: world === 'summit' ? Number(id[1]) : Number(id[2]), order: i + 1, name, biome: biomeOf(world, id),
    boss: world !== 'summit' && id.endsWith('7'), introduces, requires, mode, origin, status: def ? 'built' : 'planned',
    ...(def ? { def } : {}), collectibles: def ? starsOf(def.rows) : [], validatedFor: def ? [2] : [], ...extra,
  } satisfies CampaignLevel;
});

export const campaignLevel = (id: string): CampaignLevel => {
  const l = CAMPAIGN.find((x) => x.id === id);
  if (!l) throw new Error(`no campaign level ${id}`);
  return l;
};

// Structure of a catalog (also run on permuted copies by the sabotage test).
export function catalogErrors(levels: readonly CampaignLevel[] = CAMPAIGN): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const taught = new Set<Mechanic>();
  for (const l of levels) {
    if (ids.has(l.id)) errors.push(`${l.id}: duplicated id`);
    ids.add(l.id);
    for (const m of l.introduces) {
      if (!(MECHANICS as readonly string[]).includes(m)) errors.push(`${l.id}: unknown mechanic ${m}`);
      if (taught.has(m)) errors.push(`${l.id}: introduces ${m}, already taught`);
    }
    for (const m of l.requires) if (!taught.has(m)) errors.push(`${l.id}: requires ${m}, which no earlier level introduces`);
    for (const m of l.introduces) taught.add(m);
    if (l.status === 'built') {
      if (!l.def) { errors.push(`${l.id}: built without a tilemap`); continue; }
      if (l.def.id !== l.id) errors.push(`${l.id}: tilemap id is ${l.def.id}`);
      if (l.def.biome !== l.biome) errors.push(`${l.id}: biome ${l.def.biome}, the slot is ${l.biome}`);
      const want = l.mode === 'E' ? 'chainOnly' : l.mode === 'L' ? 'freeOnly' : 'any';
      if (l.def.tether !== want) errors.push(`${l.id}: mode ${l.mode} wants tether ${want}, the tilemap has ${l.def.tether}`);
      if (l.def.players.min !== 2 || l.def.players.max !== 2) errors.push(`${l.id}: validated for 2 players only (players ${l.def.players.min}-${l.def.players.max})`);
      if (l.collectibles.length !== 3) errors.push(`${l.id}: ${l.collectibles.length} collectibles, want 3`);
      if (l.validatedFor.join() !== '2') errors.push(`${l.id}: validatedFor ${l.validatedFor.join()}`);
    }
  }
  return errors;
}
