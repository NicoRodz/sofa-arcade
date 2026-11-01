// The games this build publishes: the one list the relay, the screen and the controller compose. A new game is one line here (and its protocol in protocol.ts).
import { obstaculosManifest } from '@pichi/game-obstaculos';
import { pizzasManifest } from '@pichi/game-pizzas';
import { createCatalog, type ComingSoon } from '@pichi/core/contract';

export const GAMES = [pizzasManifest, obstaculosManifest] as const;
export type GameId = (typeof GAMES)[number]['id'];

// Announced games: the menu shows them as a "Próximamente" card (not selectable). Not in GAMES, so config and phones never see them.
export const COMING_SOON: readonly ComingSoon[] = [
  { id: 'arena', name: 'Arena de empujones', blurb: 'Empuja a tus rivales fuera de la plataforma.' },
];

export const CATALOG = createCatalog(GAMES, COMING_SOON);
