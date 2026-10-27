// The shell's half of the Captain's touch menu: asks the picked game for its lobby form, sends it to the relay (which hands it to the Captain's phone only)
// whenever its content changes, and judges each touch the relay forwards. The game owns what the form says and what a touch does (LobbyHooks.menu / menuAct);
// nothing here knows a game. The phone never holds state: a snapshot is always the whole form, so a reconnect needs nothing but the next one.
import { acceptNav, type ServerMsg } from '@pichi/core';
import { app, pickedGame } from '../shell/app-state';
import { sendMsg } from '../net/socket';

export const MENU_DEBOUNCE_MS = 50;
let rev = 0; // bumps with every change of content; `start` must carry the current one
let last = ''; // the content last sent ('' : nothing is up)
let timer: ReturnType<typeof setTimeout> | undefined;
let again = false; // a forced send is waiting in the debounce

const body = () => (app.phase === 'lobby' && app.captainId !== null ? (pickedGame().lobby.menu?.() ?? null) : null);

/** Sends the form if it changed (or `force`: same content to a Captain that just arrived). Returns the current revision. */
function publish(force = false): number {
  const b = body();
  if (!b) {
    last = '';
    return rev;
  }
  const json = JSON.stringify(b);
  if (json === last && !force) return rev;
  if (json !== last) rev++;
  last = json;
  sendMsg({ t: 'menu', rev, ...b });
  return rev;
}

export function scheduleMenu(force = false) {
  again ||= force;
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    const f = again;
    again = false;
    publish(f);
  }, MENU_DEBOUNCE_MS);
}

export function onMenuAct(m: Extract<ServerMsg, { t: 'menuAct' }>) {
  if (!acceptNav(app.captainId, m.from)) return; // the relay already stamped and filtered; a second look costs nothing
  const hooks = pickedGame().lobby;
  if (!hooks.menuAct) return;
  const cur = publish(); // what the keyboard changed in the last 50 ms counts: judge the touch against the real state
  const refuse = (code: 'stale' | 'disabled', msg: string) => {
    sendMsg({ t: 'menuErr', rev: cur, code, msg });
    publish(true); // and the phone gets the form as it is now
  };
  if (app.phase !== 'lobby' || app.starting || app.howTo) return refuse('disabled', 'Ahora no se puede');
  const r = hooks.menuAct(m, cur);
  if (!r.ok) refuse(r.code, r.msg);
  else scheduleMenu();
}

/** Tests: forget everything. */
export function resetMenuBridge() {
  clearTimeout(timer);
  timer = undefined;
  again = false;
  rev = 0;
  last = '';
}
