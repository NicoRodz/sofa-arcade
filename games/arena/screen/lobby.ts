// Arena's half of the lobby: the team columns of Manchazo (orange against blue). It hides what belongs to the other games' lobbies and names the start button.
import { showTeams } from '@pichi/screen-kit/lobby';
import { connectedCount } from '@pichi/screen-kit/shell';
import { $ } from '@pichi/screen-kit/ui';
import { hideLobbyHint, renderLobbyTeams, startBlocker } from './match/lobby';
import { roundKind } from './match/round';

export function renderLobby() {
  $('lobbyui').classList.remove('camp');
  $('campaign').classList.add('off');
  $('pizzaops').classList.add('off');
  $('obstops').classList.add('off');
  $('obstmodewrap').classList.add('off');
  $('modebox').classList.add('off');
  $('back').textContent = '‹ Elegir otro juego · Esc';
  if (roundKind() === 'push') {
    $('start').textContent = '¡A empujar!';
    showTeams(false);
    hideLobbyHint();
    ($('start') as HTMLButtonElement).disabled = connectedCount() < 2;
    return;
  }
  $('start').textContent = '¡A manchar!';
  showTeams(true);
  renderLobbyTeams();
  ($('start') as HTMLButtonElement).disabled = !!startBlocker();
}
