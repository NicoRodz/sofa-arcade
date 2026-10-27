// The DOM side of the Captain's touch menu: mounts the form over the lobby, feeds it the screen's snapshots, turns taps into `menuAct`s (absolute values, with the
// revision the finger saw) and keeps the D-pad reachable behind "Mando". The state machine is state.ts, the markup render.ts; nothing here knows a game.
// A phone shows the form only as Captain, in the lobby and with a snapshot in hand; with none (an older screen, a game without a form) it is the D-pad as before.
import './menu.css';
import './menu-maps.css';
import type { ClientMsg, ServerMsg } from '@pichi/core';
import { fireCue, type Cue } from '../attention';
import { menuHtml } from './render';
import {
  actMsg,
  ask,
  closeMenu,
  confirmReady,
  currentTab,
  flashLeft,
  formUp,
  goBack,
  gridRow,
  initialUi,
  noticeOf,
  onErr,
  onSnapshot,
  openMaps,
  padUp,
  refuse,
  setPad,
  setTab,
  showIntro,
  toggleFit,
  touched,
  type MenuUi,
} from './state';

export interface CaptainMenuEnv {
  send(m: ClientMsg): void;
  isCaptain(): boolean;
  phase(): string;
  now?(): number;
  cue?(c: Cue): void; // the attention cue (default: the pad's pulse, tone and vibration)
}

const INTRO_KEY = 'pichiclub.captainIntro.v1'; // once per device
const introSeen = (): boolean => {
  try {
    return localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
};
const markIntro = () => {
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* storage blocked: it shows again next time */
  }
};

export function createCaptainMenu(env: CaptainMenuEnv) {
  const now = env.now ?? Date.now;
  const cue = env.cue ?? fireCue;
  let ui: MenuUi = initialUi();
  let root: HTMLElement | null = null;
  let back: HTMLButtonElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let shownView = '';

  const buzz = () => {
    try {
      navigator.vibrate?.(8);
    } catch {
      /* no vibration API (iOS) */
    }
  };
  const tell = (act: Parameters<typeof actMsg>[1], row?: string, value?: string | boolean) => {
    const m = actMsg(ui, act, row, value);
    if (m) env.send({ t: 'menuAct', ...m });
    ui = touched(ui, row, now());
  };

  function mount() {
    if (root) return;
    root = document.createElement('section');
    root.id = 'cmenu';
    root.setAttribute('aria-label', 'Menú del Capitán');
    root.addEventListener('pointerup', tap);
    back = document.createElement('button');
    back.id = 'cmenu-back';
    back.type = 'button';
    back.textContent = '‹ Menú';
    back.addEventListener('pointerup', () => {
      ui = setPad(ui, false);
      paint();
    });
    document.body.append(root, back);
  }

  function paint() {
    mount();
    const cap = env.isCaptain();
    const up = formUp(ui, cap, env.phase());
    document.body.dataset.menu = up ? 'on' : padUp(ui, cap, env.phase()) ? 'pad' : 'off';
    clearTimeout(timer);
    if (!up || !root) return;
    const body = root.querySelector<HTMLElement>('.cm-body');
    const keep = body && shownView === ui.view ? body.scrollTop : 0; // a repaint keeps the thumb's place in the list; a new view starts at the top
    root.innerHTML = menuHtml(ui, now());
    shownView = ui.view;
    const fresh = root.querySelector<HTMLElement>('.cm-body');
    if (fresh) fresh.scrollTop = keep;
    // what changes by itself: the notice goes away, "Sí" wakes up
    const t = now();
    const waits = [
      ui.noticeUntil > t ? ui.noticeUntil - t : 0,
      ui.view === 'confirm' && !confirmReady(ui, t) ? ui.confirmAt + 500 - t : 0,
      flashLeft(ui, t),
    ].filter((x) => x > 0);
    if (waits.length) timer = setTimeout(paint, Math.min(...waits) + 15);
  }

  function tap(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cm]');
    if (!el || !root?.contains(el) || !ui.snap) return;
    const { cm, row, val, why } = el.dataset;
    const enabled = el.dataset.en !== '0';
    if ((cm === 'set' || cm === 'press') && row && val !== undefined) {
      if (!enabled)
        ui = refuse(ui, why, now()); // the reason is already known: no round trip
      else tell(cm, row, el.dataset.bool ? val === '1' : val);
    } else if (cm === 'maps') {
      ui = openMaps(ui);
      const g = gridRow(ui.snap);
      if (g) tell('focus', g.id, currentTab(ui) ?? undefined); // the TV turns to the map page and rings the row
    } else if (cm === 'tab' && val) {
      ui = setTab(ui, val);
      const g = gridRow(ui.snap);
      if (g) tell('focus', g.id, val);
    } else if (cm === 'fit') ui = toggleFit(ui);
    else if (cm === 'intro') {
      markIntro();
      ui = showIntro(ui, false);
    } else if (cm === 'back') ui = goBack(ui);
    else if (cm === 'go') ui = enabled && !el.classList.contains('off') ? ask(ui, now()) : refuse(ui, why, now());
    else if (cm === 'yes') {
      if (!confirmReady(ui, now())) return;
      tell('start');
      ui = goBack(ui);
    } else if (cm === 'help')
      env.send({ t: 'nav', key: 'help' }); // the how-to card on the big screen
    else if (cm === 'pad') ui = setPad(ui, true);
    else return;
    buzz();
    paint();
  }

  return {
    /** Every relay message: the snapshot and the screen's refusals are ours; the crown and the phase decide whether the form is up. */
    onMessage(m: ServerMsg) {
      if (m.t === 'menu' && env.isCaptain()) {
        const { t: _t, ...snap } = m;
        const before = ui;
        ui = onSnapshot(ui, snap, now());
        if (!before.snap && !introSeen())
          ui = showIntro(ui, true); // S5: the crown's cue is already ringing, the card says what to do
        else if (before.snap && Object.keys(ui.flash).some((id) => !((before.flash[id] ?? 0) > now()))) cue('soft'); // someone else (the keyboard) changed a row
        paint();
      } else if (m.t === 'menuErr' && env.isCaptain()) {
        ui = onErr(ui, m, now());
        paint();
      }
    },
    /** The crown, the phase or the socket changed: the form closes (and forgets its views) when it is no longer ours to show. */
    refresh() {
      if (!env.isCaptain() || env.phase() !== 'lobby') ui = closeMenu(ui);
      paint();
    },
    /** For tests and headless drivers. */
    state: () => ({ ...ui, notice: noticeOf(ui, now()) }),
  };
}
