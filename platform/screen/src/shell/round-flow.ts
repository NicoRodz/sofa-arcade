// Starting a round: iris closes, the "how to play" card shows for ~10 s (Enter skips), iris again, then the countdown.
// Also leaving the lobby. Moved out of apps/screen/src/main.ts (F4b) unchanged; the only game-specific steps are the games' own hooks.
import { howToHtml } from '@pichi/core/render';
import { GAMES, gameInfo } from '@pichi/core/games';
import { $ } from '../ui/dom';
import { NAV_SFX } from '../menu';
import { isExpired, progress, secondsLeft, type HowToState } from '../howto';
import { app, canStartNow, dispatch, pickedGame, services, transition } from './app-state';

export function startRound() {
  if (app.phase !== 'lobby' || app.starting || app.howTo || !canStartNow()) return;
  if (pickedGame().lobby.beforeStart?.()) return; // the school took over
  app.starting = true;
  services.iris(
    () => openHowTo('start'),
    () => {
      app.starting = false;
    },
  );
}

export function beginRound() {
  if (app.starting) return;
  app.starting = true;
  services.iris(
    () => {
      closeHowTo();
      dispatch('start');
      app.gateUntil = performance.now() + 700;
    },
    () => {
      app.starting = false;
    },
  );
}

export function openHowTo(mode: HowToState['mode']) {
  const g = GAMES.find((x) => x.id === app.config.game) ?? GAMES[0];
  app.howTo = { mode, startedAt: performance.now() };
  $('howtogame').textContent = g.name;
  $('howtobody').innerHTML = howToHtml(gameInfo(g.id, GAMES, app.config.modeId).howTo);
  $('howtobar').style.visibility = mode === 'start' ? 'visible' : 'hidden';
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
  const now = performance.now();
  if (howTo.mode === 'start') {
    if (isExpired(howTo, now)) {
      beginRound();
      return;
    }
    ($('howtofill') as HTMLElement).style.width = `${(progress(howTo.startedAt, now) * 100).toFixed(1)}%`;
    $('howtohint').innerHTML = `Empieza en <b>${secondsLeft(howTo.startedAt, now)}</b> · Enter para saltar`;
  } else {
    ($('howtofill') as HTMLElement).style.width = '0';
    $('howtohint').innerHTML = '<b>H</b> o <b>Enter</b> para cerrar';
  }
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
