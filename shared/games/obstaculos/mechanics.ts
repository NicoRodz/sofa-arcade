// Mechanic ids of the campaign (plan "Obstaculos en cadena: campana y profundizacion", §2 and §4).
// OWNER: S1 (sim/rules) defines the real ids; S2 (levels, validator) uses these until S1's land. Ids not yet in the sim take the plan's name.
// A mechanic is what a level can TEACH (`introduces`) or RELY ON (`requires`); the learning test runs a bot that only knows the ones taught so far.
export const MODELED = ['jump', 'tower', 'hand', 'throw', 'swing', 'ladder', 'spring', 'mover', 'balance', 'plate', 'lever', 'key'] as const;
// Not modelled by the validator's graph: a level that teaches one of these is solvable without it as far as the validator can tell
// (the real sim bot of A2 must show its use). `passive` ones are felt, not needed (coyote), so they have no debut check either.
export const SIM_ONLY = ['move', 'rope', 'coyote', 'signals', 'anchor', 'superjump', 'target', 'softEnemies', 'ice', 'wind', 'pickaxe', 'lantern', 'bungee', 'sinkers', 'geyser', 'belt', 'cart', 'lava', 'crumble'] as const;
export const MECHANICS = [...MODELED, ...SIM_ONLY] as const;
export type Mechanic = (typeof MECHANICS)[number];
export type ModeledMechanic = (typeof MODELED)[number];

export const isModeled = (m: string): m is ModeledMechanic => (MODELED as readonly string[]).includes(m);

// Spanish names, for hints, the practice room and the map.
export const MECHANIC_NAME: Record<Mechanic, string> = {
  jump: 'Saltar', tower: 'Torre humana', hand: 'Mano amiga', throw: 'Lanzamiento', swing: 'Columpio', ladder: 'Escalera', spring: 'Resorte',
  mover: 'Plataforma móvil', balance: 'Balanza', plate: 'Placa', lever: 'Palanca', key: 'Llave',
  move: 'Mover', rope: 'Cuerda', coyote: 'Coyote', signals: 'Señales', anchor: 'Ancla', superjump: 'Supersalto', target: 'Diana', softEnemies: 'Enemigos suaves',
  ice: 'Hielo', wind: 'Viento', pickaxe: 'Piolet', lantern: 'Farol', bungee: 'Cuerda elástica', sinkers: 'Hundibles', geyser: 'Géiser', belt: 'Cintas', cart: 'Vagonetas', lava: 'Lava', crumble: 'Tablones',
};
