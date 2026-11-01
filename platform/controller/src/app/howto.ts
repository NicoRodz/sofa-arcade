// "Cómo se juega": one-view summary, closed with a tap. Opens on join and when the lobby picks a game not shown yet.
import type { HowTo } from '@pichi/core/contract';
import type { Phase } from '@pichi/core';
import { howToHtml } from '@pichi/core/render';
import { seenAfterPhase, shouldShowHowTo } from '../howto';
import type { Session } from './store';

export interface HowToUi {
  render(game: string, name: string, h: HowTo): void;
  /** A phase arrived: forget the game on the menu, show the summary of a game just entered, hide it while playing. */
  onPhase(p: Phase, live: boolean): void;
}

export function createHowTo(s: Session): HowToUi {
  const { $ } = s;
  const set = (open: boolean) => {
    s.root.dataset.howto = open ? 'open' : 'closed';
  };
  const maybeShow = () => {
    if (s.shown && shouldShowHowTo(s.seenGame, s.shown.game, s.phase)) {
      s.seenGame = s.shown.game;
      set(true);
    }
  };
  // pointerup, not click: a touchend inside the double-tap window is cancelled (see touch-guard) and would swallow the click
  $('howto').addEventListener('pointerup', () => set(false));
  $('howtoopen').addEventListener('pointerup', () => set(true));
  return {
    render(game, name, h) {
      s.shown = { game, name, howTo: h };
      $('howtogame').textContent = name;
      $('howtobody').innerHTML = howToHtml(h);
      maybeShow();
    },
    onPhase(p, live) {
      s.seenGame = seenAfterPhase(s.seenGame, p);
      if (p === 'menu') set(false);
      else maybeShow(); // the screen just entered a game: show its summary
      if (live) set(false);
    },
  };
}
