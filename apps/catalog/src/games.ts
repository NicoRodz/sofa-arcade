// The games this build publishes: the one list the relay, the screen and the controller compose. A new game is one line here (and its protocol in protocol.ts).
import { arenaManifest } from '@pichi/game-arena';
import { obstaculosManifest } from '@pichi/game-obstaculos';
import { pizzasManifest } from '@pichi/game-pizzas';
import { createCatalog, type ComingSoon, type GameManifest } from '@pichi/core/contract';

export const GAMES = [pizzasManifest, obstaculosManifest] as const;
export type GameId = (typeof GAMES)[number]['id'];

// Games in development (manifest `soon: true`): the relay and the phones know them, so a screen opened with `?soon=1` can pick one and play it; the screen's own
// menu does not offer them otherwise. Not in GAMES: that list is what this build publishes.
export const IN_DEVELOPMENT = [arenaManifest] as const satisfies readonly (GameManifest & { soon: true })[];

// Announced games: the menu shows them as a "Próximamente" card (not selectable). Derived from the manifests in development, so the card says what the manifest says.
export const COMING_SOON: readonly ComingSoon[] = IN_DEVELOPMENT.map(({ id, name, blurb }) => ({ id, name, blurb }));

/** What the screen's menu lists by default: the published games and the announced ones. */
export const CATALOG = createCatalog(GAMES, COMING_SOON);
/** Every game, the ones in development included: what the relay accepts and the phones name; the screen binds it only with `?soon=1`. */
export const DEV_CATALOG = createCatalog([...GAMES, ...IN_DEVELOPMENT], COMING_SOON);
