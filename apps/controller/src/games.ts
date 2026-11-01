// The games this phone composes: one line per game (plan: apps/controller/src/games.ts). Every other game of the catalog shows its name in the lobby.
import { arenaController } from '@pichi/game-arena/controller';
import { obstaculosController } from '@pichi/game-obstaculos/controller';
import { pizzasController } from '@pichi/game-pizzas/controller';
import type { ControllerGame } from '@pichi/controller-kit';

export const controllerGames: readonly ControllerGame[] = [pizzasController, obstaculosController, arenaController];
