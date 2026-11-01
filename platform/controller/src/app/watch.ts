// The phone that is on no team in a versus round (it joined after the start: the screen has no chef for it) is not a pad: it says when
// it plays. The next round (rematch or lobby) deals it into a team and `you` takes this away.
import type { Phase } from '@pichi/core';

export interface WatchDeps {
  phase: () => Phase;
  myTeam: () => number | null;
  view: (v: string) => void;
  renderCaptain: () => void;
}

/** The text under the crown on the waiting view (the lobby view is also what a watching phone shows during the round). */
export const waitText = (joined: boolean, watching: boolean, captain: boolean): string =>
  !joined ? 'Esperando que inicie la partida' : watching ? 'Entras en la próxima ronda' : captain ? 'Eres el Capitán' : 'Elige el Capitán';

export function createWatch(d: WatchDeps) {
  let versusRound = false;
  const watching = () => d.phase() === 'playing' && versusRound && d.myTeam() === null;
  return {
    watching,
    /** Each `phase` message says whether the round is a versus one. */
    setVersusRound(on: boolean) {
      versusRound = on;
    },
    /** The view for phase `p` (`live`: a round is on): the pad, or the waiting view for a phone that is not in it. */
    show(live: boolean, p: string) {
      d.view(live ? (watching() ? 'lobby' : 'playing') : p);
      d.renderCaptain();
    },
    /** `you` arrived (or went): a round in progress shows the pad or the waiting view accordingly. */
    refresh() {
      if (d.phase() === 'playing') this.show(true, 'playing');
    },
  };
}
