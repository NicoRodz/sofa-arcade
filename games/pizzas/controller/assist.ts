// Modo Ayudante, explained on the phone: the switch says what it gives and when it helps, turning it on confirms with a short notice, and
// "¿Qué es?" opens a three-line card (also for the Captain, whose D-pad the overlay keeps clear of). The texts are pure (the tests import them in node); the DOM is built by createAssist.
import type { ControllerHost } from '@pichi/controller-kit';
export const ASSIST_TITLE = 'Modo Ayudante';
export const ASSIST_GIVES = 'Más alcance, no resbalas, picas con un toque';
export const ASSIST_FOR = 'Para niños o quien recién empieza';
export const ASSIST_CARD_LINES = [
  'Alcance ×1,5 con auto-orientación, y sin inercia al moverte.',
  'Picar y lavar con un toque; inmune al resbalón y a la catapulta.',
  'En versus, el equipo con Ayudantes pesa menos en el handicap.',
] as const;
export const TOAST_MS = 3200;

export const assistLabel = (on: boolean) => `${ASSIST_TITLE}: ${on ? 'sí' : 'no'}`;
export const assistToast = (on: boolean) => (on ? 'Ayudante activado: llevarás un gorro con hélice' : 'Ayudante desactivado');

const byId = (id: string) => document.getElementById(id)!;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Brief notice after the player's own tap (never for the relay's echo of a reconnect). */
export function announceAssist(on: boolean) {
  const t = byId('assisttoast');
  t.textContent = assistToast(on);
  document.body.dataset.assisttoast = 'on';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => delete document.body.dataset.assisttoast, TOAST_MS);
}

export function setAssistHelp(open: boolean) {
  document.body.dataset.assisthelp = open ? 'open' : 'closed';
}

export function mountAssistHelp() {
  const btn = byId('assist');
  byId('assistlbl').textContent = assistLabel(false);
  const sub = document.createElement('small');
  sub.id = 'assistsub';
  sub.textContent = ASSIST_GIVES;
  const note = document.createElement('small');
  note.id = 'assistnote';
  note.textContent = ASSIST_FOR;
  byId('assistlbl').after(sub, note);
  // [switch] [¿Qué es?] side by side; the row is what shows only in pizzas
  const row = document.createElement('div');
  row.id = 'assistrow';
  const q = document.createElement('button');
  q.id = 'assisthelpopen';
  q.type = 'button';
  q.textContent = '¿Qué es?';
  q.setAttribute('aria-label', '¿Qué es el Modo Ayudante?');
  btn.replaceWith(row);
  row.append(btn, q);
  const card = document.createElement('div');
  card.id = 'assisthelp';
  card.className = 'overlay';
  card.innerHTML = `<h2>${ASSIST_TITLE}</h2><ul>${ASSIST_CARD_LINES.map((l) => `<li>${l}</li>`).join('')}</ul><button id="assisthelpclose" type="button">Entendido</button>`;
  const toast = document.createElement('div');
  toast.id = 'assisttoast';
  toast.setAttribute('role', 'status');
  document.body.append(card, toast);
  // pointerup, not click (see the how-to card of the platform)
  q.addEventListener('pointerup', (e) => {
    e.preventDefault();
    setAssistHelp(true);
  });
  card.addEventListener('pointerup', () => setAssistHelp(false));
}

/**
 * Ayudante (sim/assist.ts): one switch for this player, in the lobby. The phone shows what it asked for at once and the relay's echo ('assist' with this id) confirms it,
 * also after a reconnect (the relay keeps the choice with the slot).
 */
export function createAssist(host: ControllerHost) {
  let on = false;
  mountAssistHelp();
  const show = (v: boolean) => {
    on = v;
    byId('assist').classList.toggle('on', v);
    byId('assist').setAttribute('aria-pressed', String(v));
    byId('assistlbl').textContent = assistLabel(v);
  };
  byId('assist').addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (host.phase() !== 'lobby') return;
    show(!on);
    host.send({ t: 'assist', on });
    announceAssist(on);
  });
  return { show };
}
