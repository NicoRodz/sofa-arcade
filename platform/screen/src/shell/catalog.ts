// The games this screen knows and the lobby it starts with, bound once by the composition root before the shell loads (apps/screen/src/catalog.ts is the
// first import of main.ts; the tests bind them in their setup file). The shell never lists games itself: it reads them from here.
import type { LobbyConfig } from '@pichi/core';
import type { GameCatalog } from '@pichi/core/contract';

let held: { catalog: GameCatalog; defaults: LobbyConfig } | null = null;

export const bindCatalog = (catalog: GameCatalog, defaults: LobbyConfig) => {
  held = { catalog, defaults };
};
const bound = () => {
  if (!held) throw new Error('no game catalog bound: import the composition root first (apps/screen/src/catalog.ts)');
  return held;
};
export const catalog = (): GameCatalog => bound().catalog;
export const defaultConfig = (): LobbyConfig => bound().defaults;
