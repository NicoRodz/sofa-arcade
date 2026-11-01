// The part of the screen the menu and every lobby share: the logo, the QR + room code, the connected players and the difficulty pills.
// The rest of a lobby is the game's (ScreenGame.lobby.render). Moved out of apps/screen/src/main.ts (F4b).
import { DIFFICULTIES } from '@pichi/core';
import { PLATFORM } from '@pichi/core/contract';
import { paintLogo, paintTitle } from '../art/sofa-brand';
import { catalog } from '../shell/catalog';
import { renderMenu } from '../menu/view';
import { $ } from '../ui/dom';
import { diffPills, playersCount } from '../screens/lobby/model';
import { renderDifficulty, renderPlayersHeading } from '../screens/lobby/view';
import { app, connectedCount, pickedGame, setConfig } from '../shell/app-state';
import { renderChips, showTeams } from './chips';
import { paintFocus } from './focus-nav-dom';
import { scheduleMenu } from './menu-bridge';

export function paintUi() {
  scheduleMenu(); // whatever changed, the Captain's form follows (a snapshot only goes out when its content did)
  const inMenu = app.phase === 'menu';
  const lobby = app.phase === 'lobby';
  const hub = inMenu || lobby; // both share the logo, the QR + room code and the connected players
  $('lobbybg').classList.toggle('off', !hub);
  $('stage').classList.toggle('off', !hub);
  $('menuui').classList.toggle('off', !inMenu);
  $('lobbyui').classList.toggle('off', !lobby);
  $('results').classList.toggle('off', app.phase !== 'results');
  $('debug').classList.toggle('off', !app.debugOverride);
  if (!hub) return;
  document.body.classList.toggle('sa-menu', inMenu); // the menu's own look (plum, Sofa pop); the lobbies keep the game's
  paintLogo($('logo'), app.config.game, inMenu ? undefined : pickedGame().lobby.logo); // the menu wears the sofa; a lobby, its game's mark
  paintTitle($('title'), inMenu ? PLATFORM : catalog().name(app.config.game), inMenu);
  $('platform').textContent = inMenu ? 'Juegos de sillón · tu celular es el control' : PLATFORM;
  renderPlayersHeading(playersCount(connectedCount()));
  renderChips();
  if (inMenu) {
    showTeams(false);
    renderMenu();
    return;
  }
  // a game with nothing to configure (Arena) has no setup panel at all: the "Dificultad" box would be the only thing in it
  $('setup').classList.toggle('off', !!pickedGame().lobby.noOptions);
  renderDifficulty(diffPills(app.config.difficulty));
  pickedGame().lobby.render();
  paintFocus();
}

export function initLobby() {
  $('diffs').addEventListener('click', (e) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>('[data-diff]')?.dataset.diff;
    const diff = DIFFICULTIES.find((x) => x === d);
    if (!diff) return;
    setConfig({ difficulty: diff, ...pickedGame().lobby.difficulty?.(diff) }); // the sabotage level follows the difficulty until the host picks one by hand
  });
}
