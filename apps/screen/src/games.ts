// The games this screen composes: one line per game (plan: apps/screen/src/games.ts). The order is the menu's.
import { obstaculosScreen } from '@pichi/game-obstaculos/screen';
import type { ScreenGame } from '@pichi/screen-kit/shell';
import { pizzasScreen } from '@pichi/game-pizzas/screen';

export const screenGames: readonly ScreenGame[] = [pizzasScreen, obstaculosScreen];
