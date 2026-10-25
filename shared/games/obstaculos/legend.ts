// ASCII legend (plan §9) and the tile kinds the simulation collides with.
// Tile kinds are numbers in a Uint8Array grid. Entities that are not terrain (spawn, checkpoint, goal, star, ring, box, key)
// leave Empty behind and are listed by the parser instead.
export const T = {
  Empty: 0,
  Solid: 1, // '#'
  OneWay: 2, // '=' lands from above only
  Spikes: 3, // '^' hazard
  Liquid: 4, // '~' water or lava (the biome decides) hazard
  Ladder: 5, // '|'
  FreeSolid: 6, // '%' solid only in Libres: buildGrid turns it into Solid or Empty
  Crumble: 7, // '!' solid; F2a collapses it (0.5 s) and brings it back (3 s)
  BeltL: 8, // '<' solid with a surface velocity
  BeltR: 9, // '>'
  Trampoline: 10, // 'T' one-way surface that launches at 1.45 * v0
  Door: 11, // 'K' solid until its key opens it
  Object: 12, // 'a'-'f' / 'A'-'F': placeholder; F2a overlays plates, gates, movers, ladders
  Ice: 13, // 'I' solid; the campaign (dynamic 7) makes its top slippery and (dynamic 9) a pickaxe climbs its sides
  Crystal: 14, // 'Y' campaign dynamic 10: a crystal in the dark, you walk through it (it is NOT solid)
  CrystalLit: 15, // runtime only (never in a level): a crystal the lantern lights is solid (sim/lantern.ts toggles the two)
} as const;
export type TileKind = (typeof T)[keyof typeof T];

export type Marker = 'spawn' | 'checkpoint' | 'goal' | 'star' | 'ring' | 'box' | 'heavyBox' | 'key' | 'pickaxe' | 'lantern' | 'bungee';

// char -> what it is. Letters a-f and A-F are handled separately (isActivator / isObjective).
export const TILE_CHARS: Record<string, TileKind> = {
  '.': T.Empty,
  '#': T.Solid,
  '=': T.OneWay,
  '^': T.Spikes,
  '~': T.Liquid,
  '|': T.Ladder,
  '%': T.FreeSolid,
  '!': T.Crumble,
  '<': T.BeltL,
  '>': T.BeltR,
  T: T.Trampoline,
  K: T.Door,
  I: T.Ice,
  Y: T.Crystal,
};
export const MARKER_CHARS: Record<string, Marker> = {
  S: 'spawn',
  P: 'checkpoint',
  G: 'goal',
  '*': 'star',
  o: 'ring',
  x: 'box',
  X: 'heavyBox',
  k: 'key',
  p: 'pickaxe',
  l: 'lantern',
  u: 'bungee',
};

export const isActivator = (c: string) => c >= 'a' && c <= 'f';
export const isObjective = (c: string) => c >= 'A' && c <= 'F';
export const isLegendChar = (c: string) => c in TILE_CHARS || c in MARKER_CHARS || isActivator(c) || isObjective(c);

// Solid for walking/standing from any side. FreeSolid must be resolved by buildGrid first (it is not solid here).
export const isSolidKind = (k: number): boolean =>
  k === T.Solid || k === T.Crumble || k === T.BeltL || k === T.BeltR || k === T.Door || k === T.Ice || k === T.CrystalLit;
// Surfaces a body lands on only when falling onto their top.
export const isOneWayKind = (k: number): boolean => k === T.OneWay || k === T.Trampoline;
export const isHazardKind = (k: number): boolean => k === T.Spikes || k === T.Liquid;
