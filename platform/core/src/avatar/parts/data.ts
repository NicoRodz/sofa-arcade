// Part tables (plan creador-personajes §2): clothes, hats and the per-game role overrides (§3). Data only.
export interface ClothesSpec {
  top: string;
  bottom: string;
  sleeves: 'short' | 'long' | 'none';
  legs: 'long' | 'short' | 'skirt' | 'dress';
  deco: 'none' | 'stripes' | 'plaid' | 'flowers' | 'dots' | 'overall' | 'jacket' | 'hoodie' | 'sweater' | 'surf';
  accent: string;
}
/** The 11 global clothes ids. None of these colours may be a slot/identity colour (identity is the ring and the tag, never the clothes). */
export const CLOTHES: readonly ClothesSpec[] = [
  { top: '#F4F4F0', bottom: '#4C6A92', sleeves: 'short', legs: 'long', deco: 'none', accent: '#F4F4F0' },
  { top: '#7C8A55', bottom: '#2F3B55', sleeves: 'long', legs: 'long', deco: 'hoodie', accent: '#EFE6D2' },
  { top: '#6BB7CF', bottom: '#EFE6D2', sleeves: 'short', legs: 'short', deco: 'flowers', accent: '#F4F4F0' },
  { top: '#D2A84A', bottom: '#4C6A92', sleeves: 'short', legs: 'long', deco: 'overall', accent: '#4C6A92' },
  { top: '#9E3B32', bottom: '#5B4636', sleeves: 'long', legs: 'long', deco: 'plaid', accent: '#2A211C' },
  { top: '#2F3B55', bottom: '#2F3B55', sleeves: 'short', legs: 'short', deco: 'surf', accent: '#D2603A' },
  { top: '#F4F4F0', bottom: '#8A8F98', sleeves: 'short', legs: 'short', deco: 'stripes', accent: '#2F3B55' },
  { top: '#4C6A92', bottom: '#3A2F29', sleeves: 'long', legs: 'long', deco: 'jacket', accent: '#F4F4F0' },
  { top: '#D2A84A', bottom: '#D2A84A', sleeves: 'none', legs: 'dress', deco: 'dots', accent: '#F4F4F0' },
  { top: '#F4F4F0', bottom: '#B8664A', sleeves: 'short', legs: 'skirt', deco: 'stripes', accent: '#2F3B55' },
  { top: '#B8664A', bottom: '#8A8F98', sleeves: 'long', legs: 'long', deco: 'sweater', accent: '#8F4A34' },
];
export const clothesSpec = (id: number): ClothesSpec => CLOTHES[id] ?? CLOTHES[0]!;

/** `show`: which hair stays visible under the hat. cap = the crown of the hair, fringe = the 3-spike fringe. Side lobes and the ponytail always show. */
export interface HatSpec {
  id: string;
  color: string;
  cap: boolean;
  fringe: boolean;
}
export const HATS: readonly (HatSpec | null)[] = [
  null,
  { id: 'jockey', color: '#2F3B55', cap: false, fringe: true },
  { id: 'wool', color: '#D2A84A', cap: false, fringe: false },
  { id: 'straw', color: '#E3C27A', cap: false, fringe: true },
  { id: 'bandana', color: '#B8443A', cap: false, fringe: false },
  { id: 'crown', color: '#F2C230', cap: true, fringe: true },
];
export const ROLE_HATS: Readonly<Record<string, HatSpec>> = {
  chef: { id: 'chef', color: '#F4F4F0', cap: false, fringe: false },
  helmet: { id: 'helmet', color: '#9AA5B5', cap: false, fringe: false },
};

/** What a game's role replaces. `head` replaces the hat slot (never stacks); 'own' keeps the player's. */
export interface RoleSpec {
  head: 'own' | 'chef' | 'helmet' | 'none';
  overlay: 'none' | 'apron' | 'harness';
  backScale: number;
}
/** opts.role is the game id: lobby/arena/unknown keep the player's own look. */
export const ROLES: Readonly<Record<string, RoleSpec>> = {
  pizzas: { head: 'chef', overlay: 'apron', backScale: 1 },
  obstaculos: { head: 'helmet', overlay: 'harness', backScale: 0.6 },
  arena: { head: 'own', overlay: 'none', backScale: 1 },
};
export const roleSpec = (role?: string): RoleSpec =>
  role !== undefined && Object.hasOwn(ROLES, role) ? ROLES[role]! : { head: 'own', overlay: 'none', backScale: 1 };
