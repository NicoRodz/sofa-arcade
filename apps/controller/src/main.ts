// Pichiclub's phone: the composition root. The platform (platform/controller/src/app) owns the pad, the lobby and the socket; each game plugs in through
// its ControllerGame (games.ts).
import '@pichi/controller-kit/touch-guard'; // side effects only: the touch and zoom hardening of the page
import { CATALOG } from '@pichi/catalog';
import { startController } from '@pichi/controller-kit/app/start';
import { controllerGames } from './games';

startController({ games: controllerGames, root: document.body, catalog: CATALOG });
