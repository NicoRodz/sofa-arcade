// One handler for the Mac keyboard and for the Captain's D-pad (which arrives as the key it replaces): the menus, the how-to card, the
// lobby and the results all read keys here. The games hook in through ScreenGame.key (before the card), lobby.key and results.enter.
// Moved out of apps/screen/src/main.ts (F4b); the Obstaculos / Pizzas branches became those hooks.
import { howToOnKey } from '../howto';
import { lobbyEscGoesBack, menuCards, menuOnKey } from '../menu';
import { menuAct } from '../menu/view';
import { toggleShake } from '../art/fx';
import { activeGame, app, connectedCount, dispatch, pickedGame, renderUi } from '../shell/app-state';
import { games } from '../shell/game';
import { beginRound, closeHowTo, goBack, openHowTo, startRound } from '../shell/round-flow';

export function onKey(key: string, repeat: boolean) {
  // the school owns every key while it runs (and P in the lobby); the campaign owns the arrows, Enter, Esc and "?" in its screens
  for (const g of games().list()) if (g.key?.(key, repeat)) return;
  const act = app.starting ? 'none' : howToOnKey(app.howTo, app.phase, key);
  if (act === 'open-preview') {
    openHowTo('preview');
    return;
  }
  if (act === 'close') {
    closeHowTo();
    return;
  }
  if (act === 'skip') {
    beginRound();
    return;
  }
  if (app.howTo || app.starting) return; // the card swallows Enter and the iris swallows everything
  if (app.phase === 'menu') {
    menuAct(menuOnKey(menuCards(connectedCount()), app.menuSel, key));
    return;
  }
  if (app.phase === 'lobby' && pickedGame().lobby.key?.(key, repeat)) return; // the game's own lobby keys (events, sabotage level)
  if (lobbyEscGoesBack(app.phase, key, !!app.howTo, app.starting)) {
    goBack();
    return;
  }
  if (key === 'Enter' && repeat) return; // a held Enter that picked the game must not also start the round
  if (key === 'Enter' && app.phase === 'lobby') startRound();
  else if (key === 'Enter' && app.phase === 'results') {
    const results = activeGame().results;
    if (results.enter) results.enter();
    else dispatch('again');
  }
}

export function initKeys() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') {
      app.debugOverride = !app.debugOverride;
      renderUi();
      return;
    }
    for (const g of games().list()) g.globalKey?.(e); // M mutes (the pizza audio listens to the same key itself)
    if ((e.key === 's' || e.key === 'S') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      toggleShake();
      return;
    }
    app.lastKeyAt = performance.now();
    onKey(e.key, e.repeat);
  });
}
