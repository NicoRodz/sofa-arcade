// Start menu: one persistent card per registry game (plus the announced ones), so the art is drawn once and the idle state never restarts.
// Moved out of apps/screen/src/main.ts (F4b); picking a game asks the game for its config reset and its after-pick step.
import './menu.css';
import { menuCards, menuPick, soundFor, NAV_SFX, type MenuAction } from '../menu';
import { $ } from '../ui/dom';
import { menuView } from '../screens/menu/model';
import { renderMenuCards } from '../screens/menu/view';
import { app, connectedCount, dispatch, renderUi, services, setConfig, transition } from '../shell/app-state';
import { games } from '../shell/game';

export function renderMenu() {
  const m = menuView(menuCards(connectedCount()), app.menuSel);
  app.menuSel = m.sel;
  renderMenuCards(m, (cv, id) => services.cardArt(cv, id));
}

export function menuAct(a: MenuAction) {
  const snd = soundFor(a);
  if (snd) services.ui(NAV_SFX[snd]);
  if (a.kind === 'move') {
    app.menuSel = a.sel;
    renderUi();
  } else if (a.kind === 'pick') {
    const g = games().get(a.id);
    if (g)
      transition(() => {
        // a game that has no versus must not inherit the teams or the options of the one before (the relay would refuse the whole config)
        setConfig({ game: g.manifest.id, ...g.lobby.pickReset(app.config.game) });
        dispatch('pick');
        g.lobby.afterPick?.();
      });
  } else if (a.kind === 'refuse') {
    const el = $('menucards').querySelector<HTMLElement>('.sel');
    el?.classList.remove('nope');
    void el?.offsetWidth;
    el?.classList.add('nope');
  }
}

export function initMenu() {
  $('menucards').addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-game]')?.dataset.game;
    if (!id || app.starting || app.phase !== 'menu') return;
    const cards = menuCards(connectedCount());
    app.menuSel = Math.max(
      0,
      cards.findIndex((c) => c.id === id),
    );
    renderUi();
    menuAct(menuPick(cards, id));
  });
  $('menucards').addEventListener('pointermove', (e) => {
    // hovering moves the highlight (silently), so mouse and keys agree
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-game]')?.dataset.game;
    const i = menuCards(connectedCount()).findIndex((c) => c.id === id);
    if (i >= 0 && i !== app.menuSel && app.phase === 'menu' && !app.starting) {
      app.menuSel = i;
      renderUi();
    }
  });
}
