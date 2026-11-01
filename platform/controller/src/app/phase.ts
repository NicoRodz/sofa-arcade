// What a `phase` message does to the phone: the view, the pad, the score of the round and the buzz (R7: vibrate where the browser can (Android), flash the phone's colour
// where it cannot (iOS Safari has no vibration API)). The game adds its own part (stations, verdict) through `onPhase`.
import { BUZZ_PATTERNS, type BuzzKind, type PhaseInfo } from '@pichi/core';
import type { ControllerGame, ControllerSchool } from '../contract';
import type { Captain } from './captain';
import type { Controls } from './controls';
import type { HowToUi } from './howto';
import { showNote } from './notes';
import { NO_HINT, type Session } from './store';

export interface PhaseDeps {
  ctl: Controls;
  howto: HowToUi;
  cap: Captain;
  schools: readonly { id: string; ui: ControllerSchool }[];
}

export function createPhaseUi(s: Session, d: PhaseDeps) {
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  // Campaign signals: the pad of 6 buttons shows only in a campaign round (phase.match.modeOptions.campaign). While it shows, every input carries `sig` (a monotonic counter: a new
  // seq = one signal of that kind; seq 0 is the baseline the screen reads first) and `go` (true while "¡Ya!" is held: 0.4 s of it starts the 3-2-1). A quick match sends neither.
  const setSignals = (on: boolean) => {
    s.signalsOn = on;
    s.root.dataset.signals = on ? 'on' : 'off';
  };
  return {
    buzz(kind: BuzzKind) {
      if (s.phase !== 'playing' && s.phase !== 'school') return; // the school buzzes like a round
      showNote(kind); // a note over the pad: slip, big fire, a rat that dodged, first ice
      const pattern = BUZZ_PATTERNS[kind];
      try {
        if (typeof navigator.vibrate === 'function' && navigator.vibrate([...pattern])) return;
      } catch {
        /* blocked: fall back to the flash */
      }
      s.root.classList.add('flash');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => s.root.classList.remove('flash'), 120);
    },
    show(m: PhaseInfo, game: ControllerGame | undefined) {
      const p = m.phase;
      s.phase = p;
      const live = p === 'playing' || p === 'school'; // the school is played with the same pad as a round
      setSignals(p === 'playing' && m.match?.modeOptions.campaign === true);
      if (!live) d.ctl.setHint(NO_HINT); // the labels the round gave go with it
      d.howto.onPhase(p, live);
      for (const sc of d.schools) sc.ui.show(p === 'school' && (s.game === null || sc.id === s.game));
      if (!live) {
        Object.assign(s.pad, { x: 0, y: 0, btn: 0, go: false });
        s.root.querySelectorAll('.act, .sg').forEach((b) => b.classList.remove('down'));
      }
      delete s.root.dataset.outcome; // the game sets it back when it has a verdict
      if (p === 'results' && m.scores) {
        const mine = m.scores.find((x) => x.id === s.myId) ?? m.scores[0]; // cooperative: every entry carries the team score
        s.$('rank').textContent = mine ? String(mine.score) : '-';
        s.$('myscore').textContent = mine ? 'puntos de equipo' : '';
      }
      game?.onPhase?.(m, s.host);
      d.cap.watch.show(live, p);
    },
  };
}
