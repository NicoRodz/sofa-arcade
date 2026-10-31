// Design tokens: palette, type, layout and the eight chef specs. Pure data, no Phaser.
export const C = {
  ink: '#2B1B17',
  cream: '#FFF4E0',
  cocoa: '#3A2A24',
  wallTop: '#5B4038',
  tomato: '#E63B2E',
  tomato2: '#B5281F',
  basil: '#3FA34D',
  basil2: '#2A7A36',
  cheese: '#FFD23F',
  cheese2: '#E8A317',
  dough: '#F3D9A4',
  dough2: '#F7E3B8',
  doughEdge: '#E9C88A',
  crust: '#D9963F',
  burnt: '#4A2C1E',
  burnt2: '#3B2A22',
  wood: '#C98A4B',
  wood2: '#9C6232',
  board: '#E6B980',
  steel: '#B8C4CC',
  steel2: '#7D8B95',
  brick: '#B5523B',
  brick2: '#7A3527',
  fire: '#FF8A1F',
  fire2: '#FFC93C',
  floorA: '#EFE3CC',
  floorB: '#D7C3A0',
  warn: '#FFB020',
  danger: '#D7263D',
  muted: '#8A7461',
  white: '#FFFFFF',
  cardboard: '#E8C9A0',
  cardboard2: '#C9A57A',
} as const;

export const hexNum = (h: string) => parseInt(h.slice(1), 16);
export const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif';

// Logical canvas: 1920x1080, fitted to the window. The design assumed 120 px tiles; 16x9 plus the HUD strip gives 108.
export const W = 1920;
export const H = 1080;
export const HUD_H = 104;
export interface GridTokens {
  TILE: number;
  OX: number;
  OY: number;
  U: number;
}
/** The playfield of a game that draws a `cols` x `rows` tile grid under the HUD strip: tile size, origin and design-unit scale. */
export function gridTokens(cols: number, rows: number): GridTokens {
  const TILE = Math.floor((H - HUD_H) / rows);
  return {
    TILE,
    OX: Math.floor((W - TILE * cols) / 2),
    OY: HUD_H + Math.floor((H - HUD_H - TILE * rows) / 2),
    U: TILE / 120, // design units (tile = 120) to logical px
  };
}
// The canvas is 16:9, so its design tile is the one of a 16x9 grid (108 px); the chef rig and the art scale by it whichever game draws.
const CANVAS = gridTokens(16, 9);
export const TILE = CANVAS.TILE;
export const U = CANVAS.U; // design units (tile = 120) to logical px

export interface ChefSpec {
  name: string;
  color: string;
  dark: string;
  accessory: 'mustache' | 'glasses' | 'tallhat' | 'scarf' | 'pigtails' | 'cap' | 'bow' | 'beard';
}
export const CHEFS: readonly ChefSpec[] = [
  { name: 'Rojo', color: '#E63B2E', dark: '#B5281F', accessory: 'mustache' },
  { name: 'Azul', color: '#2F7DE1', dark: '#1F58A8', accessory: 'glasses' },
  { name: 'Verde', color: '#3FA34D', dark: '#2A7A36', accessory: 'tallhat' },
  { name: 'Amarillo', color: '#FFC21A', dark: '#D49A00', accessory: 'scarf' },
  { name: 'Morado', color: '#8E5CD9', dark: '#6A3CB0', accessory: 'pigtails' },
  { name: 'Naranja', color: '#FF7A1A', dark: '#D45A00', accessory: 'cap' },
  { name: 'Rosa', color: '#FF5FA2', dark: '#D43B80', accessory: 'bow' },
  { name: 'Turquesa', color: '#1FB5A8', dark: '#128A80', accessory: 'beard' },
];
export const SKINS = ['#F6D3B3', '#E8B48A', '#C68A5E', '#8D5A3B'] as const;
export const HAIRS = ['#4A2C1E', '#2B1B17', '#7A4A2A', '#1F1512'] as const;
export const chefOf = (slot: number) => CHEFS[((slot % 8) + 8) % 8]!;
export const skinOf = (slot: number) => SKINS[((slot % 4) + 4) % 4]!;
export const hairOf = (slot: number) => HAIRS[(((slot * 3 + 1) % 4) + 4) % 4]!;

// Floor palettes: one pair per map (fixed ids), random maps pick by seed.
export const FLOORS: Record<string, [string, string]> = {
  '1': ['#EFE3CC', '#D7C3A0'],
  '2': ['#DDEBD8', '#BFD6B8'],
  '3': ['#E4EBF2', '#C3D3E3'],
  '4': ['#F4DFD0', '#E0BFA6'],
  '5': ['#EFE0EF', '#D8C0D8'],
  '6': ['#E3EFE6', '#C4DCCB'],
  '7': ['#E8E4DE', '#C9C2B8'],
  '8': ['#F4E6DA', '#E2C7B0'],
  '9': ['#F3E7C9', '#E2CF9C'],
  '10': ['#DCEAF2', '#B9D3E2'],
  '11': ['#EDE0F0', '#D6C1DE'],
  '12': ['#E2E6EE', '#BFC8D6'],
  '13': ['#F0E8D9', '#D9CDB3'],
  '14': ['#E9DCE8', '#CDB6CB'],
  '15': ['#D9D5CC', '#B7B1A4'],
};
// Versus maps (V1.., the derived `<id>-vs`, the generated `vs-gen`) share one warm neutral floor: each kitchen is washed with its team's colour on top.
export const VERSUS_FLOOR: [string, string] = ['#F4EBDB', '#E3D6BD'];
export const isVersusMapId = (id: string) => /^V\d+$|-vs$|^vs-gen$/.test(id);
export const floorPair = (mapId: string, seed = 0): [string, string] =>
  isVersusMapId(mapId) ? VERSUS_FLOOR : (FLOORS[mapId] ?? FLOORS[String(1 + (Math.abs(seed) % 5))]!);

// Timer colour for tickets and bars: basil, warn under 50%, danger under 25%.
export const timerColor = (left: number) => (left > 0.5 ? C.basil : left > 0.25 ? C.warn : C.danger);
// Cutting bar: basil, cheese from 80%.
export const progressColor = (v: number) => (v >= 0.8 ? C.cheese : C.basil);
