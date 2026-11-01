// What each message of the relay does to the phone. The games see every message first (`onMessage`: true = consumed); the rest is the platform's.
import type { ServerMsg } from '@pichi/core';
import { attend } from '../attention';
import type { ControllerSchool } from '../contract';
import type { Captain } from './captain';
import type { Controls } from './controls';
import type { HowToUi } from './howto';
import type { createPhaseUi } from './phase';
import { setHud, type Session } from './store';
import type { TeamsUi } from './teams';

export interface DispatchDeps {
  ctl: Controls;
  howto: HowToUi;
  teams: TeamsUi;
  cap: Captain;
  phaseUi: ReturnType<typeof createPhaseUi>;
  schools: readonly { id: string; ui: ControllerSchool }[];
  creator: { onMessage(m: ServerMsg): void };
  pong(m: Extract<ServerMsg, { t: 'pong' }>): void;
}

export function createDispatch(s: Session, d: DispatchDeps) {
  return (m: ServerMsg) => {
    attend(m, s.myId);
    d.cap.menu.onMessage(m);
    d.creator.onMessage(m);
    for (const g of s.games) if (g.onMessage?.(m, s.host)) return;
    if (m.t === 'joined') {
      s.joined = true;
      s.myId = m.player.id;
      document.documentElement.style.setProperty('--c', m.player.color);
      s.myName = m.player.name;
      for (const sc of d.schools) sc.ui.announce(); // a phone whose player did the school says so: the screen does not offer it again for them
      setHud(s, `${m.player.name} #${m.player.slot + 1}`);
      d.cap.render();
    } else if (m.t === 'config') {
      s.game = m.game;
      s.root.dataset.game = m.game; // CSS: some switches belong to one game only
      const name = s.catalog.name(m.game);
      s.$('game').textContent = name;
      d.ctl.apply(m.controls);
      d.howto.render(m.game, name, m.howTo);
      d.teams.apply(m.teams, m.teamsLocked);
      s.$('setup').textContent = s.games.find((g) => g.id === m.game)?.setupLabel(m) ?? name;
    } else if (m.t === 'school') for (const sc of d.schools) sc.ui.apply(m);
    else if (m.t === 'you') {
      d.teams.show(m);
      d.cap.watch.refresh();
    } else if (m.t === 'phase') {
      d.cap.watch.setVersusRound(m.match?.modeId === 'versus');
      d.phaseUi.show(
        m,
        s.games.find((g) => g.id === s.game),
      );
    } else if (m.t === 'captain') {
      s.captainId = m.playerId;
      d.cap.render();
    } else if (m.t === 'buzz') d.phaseUi.buzz(m.kind);
    else if (m.t === 'hint') {
      const { t: _t, ...h } = m;
      d.ctl.setHint(h);
    } else if (m.t === 'pong') d.pong(m);
    else if (m.t === 'error') {
      s.halted = true;
      setHud(s, m.reason);
    }
  };
}
