// Arena's half of the lobby: there is nothing to configure, so it only hides what belongs to the other games' lobbies and names the start button.
import { showTeams } from '@pichi/screen-kit/lobby';
import { connectedCount } from '@pichi/screen-kit/shell';
import { $ } from '@pichi/screen-kit/ui';

export function renderLobby() {
  $('lobbyui').classList.remove('camp');
  $('campaign').classList.add('off');
  $('pizzaops').classList.add('off');
  $('obstops').classList.add('off');
  $('obstmodewrap').classList.add('off');
  $('modebox').classList.add('off');
  $('back').textContent = '‹ Elegir otro juego · Esc';
  $('start').textContent = '¡A empujar!';
  showTeams(false);
  ($('start') as HTMLButtonElement).disabled = connectedCount() < 2;
}
