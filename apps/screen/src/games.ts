// The games this screen composes: one line per game (plan: apps/screen/src/games.ts). The order is the menu's.
// A game in development is only registered when the catalog bound by ./catalog lists it (`?soon=1`): the shell refuses a game the catalog does not know.
import { arenaScreen } from '@pichi/game-arena/screen';
import { obstaculosScreen } from '@pichi/game-obstaculos/screen';
import { pizzasScreen } from '@pichi/game-pizzas/screen';
import { catalog, type ScreenGame } from '@pichi/screen-kit/shell';

export const screenGames = (): readonly ScreenGame[] =>
  [pizzasScreen, obstaculosScreen, arenaScreen].filter((g) => catalog().isGameId(g.manifest.id));
