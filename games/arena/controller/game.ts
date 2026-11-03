// Manchazo on the phone (F9). The pad (stick and two buttons) and the how-to come with the manifest; this half adds what makes the phone worth a glance: its background wears the
// team (orange with dots, blue with stripes), the card in hand colours button B, the status the hints carry ("¡MAREADO!" with the stick drawn reversed) lasts as long as it lasts,
// and each event that touches the player's body takes the whole phone for a moment (alerts.ts: colour, words, tone; the vibration is the platform's). Styles: phone.css.
// Every message reaches every game's onMessage, so everything here waits for the `arena` data attribute the platform sets on <body>.
import type { ControllerGame } from '@pichi/controller-kit';
import { DIFFICULTY_LABEL } from '@pichi/core';
import { alertFor, isAlertKind, playTones, unlockAudio, type LastAlert } from './alerts';
import { createPhoneState } from './phone-state';
import './phone.css';

interface Phone {
  onMessage(m: Parameters<NonNullable<ControllerGame['onMessage']>>[0]): void;
  onPhase(phase: string): void;
  dispose(): void;
}

function mount(): Phone {
  const body = document.body;
  const state = createPhoneState(body);
  const cue = document.createElement('div');
  cue.id = 'arenacue';
  cue.innerHTML = '<b></b><span></span>';
  const st = document.createElement('div');
  st.id = 'arenast';
  body.append(cue, st);
  let last: LastAlert | null = null;
  let off: ReturnType<typeof setTimeout> | undefined;
  addEventListener('pointerdown', unlockAudio, { passive: true });
  const mine = () => body.dataset.game === 'arena';
  return {
    onMessage(m) {
      if (m.t === 'you') state.team(m.teamId);
      if (!mine()) return;
      if (m.t === 'hint') {
        state.status(m.st);
        state.card(m.card);
      } else if (m.t === 'buzz' && isAlertKind(m.kind)) {
        const now = Date.now();
        const spec = alertFor(m.kind, last, now);
        last = { kind: m.kind, at: now };
        cue.querySelector('b')!.textContent = spec.title;
        cue.querySelector('span')!.textContent = spec.line;
        cue.style.setProperty('--bg', spec.bg);
        cue.style.setProperty('--fg', spec.fg);
        cue.classList.remove('on');
        void cue.offsetWidth; // restart the animation
        cue.classList.add('on');
        clearTimeout(off);
        off = setTimeout(() => cue.classList.remove('on'), spec.ms);
        playTones(spec.tone);
      }
    },
    onPhase(phase) {
      if (phase !== 'playing') {
        state.clear();
        cue.classList.remove('on');
      }
    },
    dispose() {
      removeEventListener('pointerdown', unlockAudio);
      cue.remove();
      st.remove();
    },
  };
}

let phone: Phone | undefined;
export const arenaController: ControllerGame = {
  id: 'arena',
  setupLabel: (cfg) => (cfg.teams ? 'Naranja contra azul' : `Último en pie · ${DIFFICULTY_LABEL[cfg.difficulty]}`),
  init() {
    phone = mount();
  },
  onMessage(m) {
    phone?.onMessage(m);
    return false; // never consumed: the platform handles every message (buzz vibrates, hint relabels) as it does for any game
  },
  onPhase(p) {
    phone?.onPhase(p.phase);
  },
  dispose() {
    phone?.dispose();
    phone = undefined;
  },
};
