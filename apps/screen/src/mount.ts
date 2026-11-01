// The first import of main.ts. ES modules evaluate in import order, so the markup is in the page before any other module asks the DOM for an element.
// The platform owns the screens (menu, lobby, results, how-to); each game adds its own markup through the slots of those fragments.
// The CSS imports keep one order: platform base and lobby, the lobby extras of Pizzas, the menu, results, how-to, then the games' results and campaign.
import { compose, mountScreens } from '@pichi/screen-kit/screens/compose';
import '@pichi/screen-kit/screens/page/style.css';
import '@pichi/screen-kit/screens/lobby/style.css';
import '@pichi/game-pizzas/screen/markup/lobby-setup.css';
import '@pichi/screen-kit/screens/menu/style.css';
import '@pichi/screen-kit/screens/results/style.css';
import '@pichi/game-pizzas/screen/markup/results.css';
import '@pichi/screen-kit/screens/howto/style.css';
import '@pichi/game-pizzas/screen/markup/versus-results.css';
import '@pichi/game-obstaculos/screen/markup/lobby.css';
import '@pichi/game-obstaculos/screen/markup/results.css';
import pageHtml from '@pichi/screen-kit/screens/page/view.html?raw';
import lobbyHtml from '@pichi/screen-kit/screens/lobby/view.html?raw';
import menuHtml from '@pichi/screen-kit/screens/menu/view.html?raw';
import resultsHtml from '@pichi/screen-kit/screens/results/view.html?raw';
import howtoHtml from '@pichi/screen-kit/screens/howto/view.html?raw';
import pizzasLobbyHint from '@pichi/game-pizzas/screen/markup/lobby-hint.html?raw';
import pizzasLobbyRow from '@pichi/game-pizzas/screen/markup/lobby-row.html?raw';
import pizzasLobbySetup from '@pichi/game-pizzas/screen/markup/lobby-setup.html?raw';
import pizzasPausebar from '@pichi/game-pizzas/screen/markup/pausebar.html?raw';
import pizzasResults from '@pichi/game-pizzas/screen/markup/results.html?raw';
import obstCampaign from '@pichi/game-obstaculos/screen/markup/campaign.html?raw';
import obstLobbyRow from '@pichi/game-obstaculos/screen/markup/lobby-row.html?raw';
import obstLobbySetup from '@pichi/game-obstaculos/screen/markup/lobby-setup.html?raw';
import obstResults from '@pichi/game-obstaculos/screen/markup/results.html?raw';

const lobby = compose(lobbyHtml, {
  menu: [menuHtml],
  'lobby-row': [obstLobbyRow, pizzasLobbyRow],
  'lobby-setup': [pizzasLobbySetup, obstLobbySetup],
  'lobby-extra': [obstCampaign],
  'lobby-hint': [pizzasLobbyHint],
});
const results = compose(resultsHtml, { 'results-head': [pizzasResults], 'results-tail': [obstResults] });
mountScreens(compose(pageHtml, { lobby: [lobby], results: [results], howto: [howtoHtml], overlays: [pizzasPausebar] }));
