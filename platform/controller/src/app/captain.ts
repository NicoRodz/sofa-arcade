// The Captain's remote: shown on every screen but the round, and only while the socket is joined (a button that cannot send would lie).
import { isNavKey, remoteVisible } from '@pichi/core';
import { createCaptainMenu } from '../menu/captain-menu';
import { bindRemote } from '../remote';
import type { ControllerSchool } from '../contract';
import { send, setView, type Session } from './store';
import { createWatch, waitText } from './watch';

export function createCaptain(s: Session, schools: readonly ControllerSchool[]) {
  const isCaptain = () => s.joined && s.captainId !== null && s.captainId === s.myId;
  const menu = createCaptainMenu({ send: (m) => send(s, m), isCaptain, phase: () => s.phase }); // the lobby as a touch form; the D-pad below is its fallback
  const watch = createWatch({ phase: () => s.phase, myTeam: () => s.myTeam, view: (v) => setView(s, v), renderCaptain: () => render() });
  function render() {
    s.root.dataset.remote = remoteVisible(isCaptain(), s.joined, s.phase) ? 'on' : 'off';
    for (const sc of schools) sc.refreshCaptain();
    menu.refresh();
    const crown = isCaptain() ? '👑 ' : '';
    for (const id of ['who', 'who2']) s.$(id).textContent = crown + s.myName;
    s.$('waitmsg').textContent = waitText(s.joined, watch.watching(), isCaptain());
  }
  bindRemote(Array.from(s.root.querySelectorAll<HTMLElement>('#remote [data-nav]')), {
    isCaptain,
    isNavKey,
    send: (key) => send(s, { t: 'nav', key }),
  });
  return { isCaptain, render, menu, watch };
}
export type Captain = ReturnType<typeof createCaptain>;
