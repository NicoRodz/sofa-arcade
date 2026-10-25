// The part of the screen the menu and every lobby share: the logo, the QR + room code, the connected players and the difficulty pills.
// The rest of a lobby is the game's (ScreenGame.lobby.render). Moved out of apps/screen/src/main.ts (F4b).
import { DIFFICULTIES, DIFFICULTY_LABEL } from '@pichi/core/difficulty';
import { PLATFORM, gameName } from '@pichi/core/games';
import { renderMenu } from '../menu/view';
import { $, setHtml } from '../ui/dom';
import { app, pickedGame, setConfig } from '../shell/app-state';
import { renderChips, showTeams } from './chips';

export function paintUi() {
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
  $('title').textContent = inMenu ? PLATFORM : gameName(app.config.game);
  $('platform').textContent = inMenu ? 'Elige un juego' : PLATFORM;
  renderChips();
  if (inMenu) {
    showTeams(false);
    renderMenu();
    return;
  }
  setHtml(
    'diffs',
    DIFFICULTIES.map(
      (d) => `<button class="pill ${d === app.config.difficulty ? 'sel' : ''}" data-diff="${d}">${DIFFICULTY_LABEL[d]}</button>`,
    ).join(''),
  );
  pickedGame().lobby.render();
}

export function initLobby() {
  $('diffs').addEventListener('click', (e) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>('[data-diff]')?.dataset.diff;
    const diff = DIFFICULTIES.find((x) => x === d);
    if (!diff) return;
    setConfig({ difficulty: diff, ...pickedGame().lobby.difficulty?.(diff) }); // the sabotage level follows the difficulty until the host picks one by hand
  });
}
