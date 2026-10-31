// The note the phone writes over the pad when a buzz carries one (the same #slip element): the slip of the sabotage and the hazards of HAZARD_V2.
import type { BuzzKind } from '@pichi/core';

// [text, colour, ms on screen]
const NOTES: Partial<Record<BuzzKind, [string, string, number]>> = {
  slip: ['¡Resbalaste!', 'var(--cheese)', 900],
  big: ['¡Fuego grande! Necesitan 2', '#ff4d3d', 2200],
  dodge: ['¡Te esquivó! Atrápala cuando jadee', '#ffb02e', 1600],
  ice: ['Hielo: frena antes', '#8fd3ff', 1600],
};
// EVENTS_V2: a note that takes the whole phone in the colour of the event (title, one line of what to do) with a short tone. [title, line, background, text colour, ms, tone Hz]
const EVENT_NOTES: Partial<Record<BuzzKind, [string, string, string, string, number, number]>> = {
  evrush: ['¡Hora punta!', 'Despacha los tickets rojos', '#ff8a1f', '#2b1200', 3200, 660],
  evbday: ['¡Cumpleaños!', 'Torta con vela: A en el cajón', '#ff5fa8', '#3a0620', 3200, 880],
  evdark: ['Sin luz', 'Ve al tablero y mantén B', '#06070d', '#ffe45c', 3200, 180],
  evspill: ['¡Derrame!', 'Limpia las manchas', '#ffd23f', '#3a2c00', 2800, 520],
  evwin: ['¡Bien hecho!', 'Evento resuelto', '#2fbf71', '#052414', 1800, 990],
  evfail: ['Ay no...', 'No alcanzó', '#d7263d', '#fff', 1800, 140],
};
let eventTimer: ReturnType<typeof setTimeout> | undefined;
let tone: AudioContext | undefined;

/** The whole-phone note of an event with presence. pointer-events: none, so the pad underneath keeps working. */
function showEventNote(n: [string, string, string, string, number, number]) {
  let el = document.getElementById('evnote');
  if (!el) {
    el = document.createElement('div');
    el.id = 'evnote';
    el.style.cssText =
      'position:fixed;inset:0;z-index:6;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2vmin;text-align:center;pointer-events:none;opacity:0;transition:opacity .15s;font:800 clamp(30px,12vmin,60px) var(--font);padding:0 6vmin';
    document.body.appendChild(el);
  }
  el.style.background = n[2];
  el.style.color = n[3];
  el.replaceChildren();
  const title = document.createElement('div');
  title.textContent = n[0];
  const line = document.createElement('div');
  line.textContent = n[1];
  line.style.cssText = 'font-size:0.45em;font-weight:700';
  el.append(title, line);
  el.style.opacity = '0.93';
  clearTimeout(eventTimer);
  eventTimer = setTimeout(() => (el.style.opacity = '0'), n[4]);
  try {
    tone ??= new AudioContext();
    const o = tone.createOscillator(),
      g = tone.createGain();
    o.frequency.value = n[5];
    g.gain.setValueAtTime(0.18, tone.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, tone.currentTime + 0.35);
    o.connect(g).connect(tone.destination);
    o.start();
    o.stop(tone.currentTime + 0.36);
  } catch {
    /* no audio: the colour carries it */
  }
}
let timer: ReturnType<typeof setTimeout> | undefined;

export function showNote(kind: BuzzKind) {
  const ev = EVENT_NOTES[kind];
  if (ev) return showEventNote(ev);
  const note = NOTES[kind];
  const el = document.getElementById('slip');
  if (!note || !el) return;
  el.textContent = note[0];
  el.style.color = note[1];
  el.classList.add('on');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('on'), note[2]);
}
