// The results screen's own wiring: the "Volver al lobby" button every game shares. What the screen shows is the game's (ScreenGame.results.render).
import { $ } from '../ui/dom';
import { dispatch } from '../shell/app-state';

export function initResults() {
  $('again').addEventListener('click', () => dispatch('again'));
}
