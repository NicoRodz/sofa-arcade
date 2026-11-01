// Starting a round: iris closes, the "how to play" card shows for ~10 s (Enter skips), iris again, then the countdown.
// Also leaving the lobby. Moved out of apps/screen/src/main.ts (F4b) unchanged; the only game-specific steps are the games' own hooks.
import { howToHtml } from '@pichi/core';
import { catalog } from './catalog';
import { $ } from '../ui/dom';
import { NAV_SFX } from '../menu';
import type { HowToState } from '../howto';
import { howToView } from '../screens/howto/model';
import { renderHowTo } from '../screens/howto/view';
import { app, canStartNow, dispatch, endIris, pickedGame, services, transition } from './app-state';

export function startRound() {
  if (app.phase !== 'lobby' || app.starting || app.howTo || !canStartNow()) return;
  if (pickedGame().lobby.beforeStart?.()) return; // the school took over
  app.starting = true;
  services.iris(() => openHowTo('start'), endIris);
}

export function beginRound() {
  if (app.starting) return;
  app.starting = true;
  services.iris(() => {
    closeHowTo();
    dispatch('start');
    app.gateUntil = performance.now() + 700;
  }, endIris);
}

// Game name and steps are read once when the card opens, as before: a config change while it shows does not rewrite it.
let card = { game: '', bodyHtml: '' };
export function openHowTo(mode: HowToState['mode']) {
  const g = catalog().games.find((x) => x.id === app.config.game) ?? catalog().games[0]!;
  card = { game: g.name, bodyHtml: howToHtml(catalog().info(g.id, app.config.modeId).howTo) };
  app.howTo = { mode, startedAt: performance.now() };
  $('howto').classList.remove('off');
  tickHowTo();
}
export function closeHowTo() {
  app.howTo = null;
  $('howto').classList.add('off');
}
function tickHowTo() {
  const howTo = app.howTo;
  if (!howTo) return;
  const view = howToView(howTo, performance.now(), card.game, card.bodyHtml);
  if (!view) beginRound();
  else renderHowTo(view);
}

export function initRoundFlow() {
  setInterval(tickHowTo, 100);
  $('start').addEventListener('click', () => startRound());
  $('howtobtn').addEventListener('click', () => {
    if (!app.howTo && !app.starting && app.phase === 'lobby') openHowTo('preview');
  });
  $('howto').addEventListener('click', () => {
    if (app.howTo?.mode === 'preview') closeHowTo();
  });
  $('back').addEventListener('click', goBack);
}

export function goBack() {
  if (app.phase !== 'lobby' || app.starting || app.howTo) return;
  services.ui(NAV_SFX.back);
  if (pickedGame().lobby.back?.()) return; // e.g. Esc in the quick-game setup of Obstaculos goes back to the campaign's hub
  transition(() => dispatch('back'));
}
