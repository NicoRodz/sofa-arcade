// The note the phone writes over the pad when a buzz carries one (the same #slip element): the slip of the sabotage and the hazards of HAZARD_V2.
import type { BuzzKind } from '@pichi/core';

// [text, colour, ms on screen]
const NOTES: Partial<Record<BuzzKind, [string, string, number]>> = {
  slip: ['¡Resbalaste!', 'var(--cheese)', 900],
  big: ['¡Fuego grande! Necesitan 2', '#ff4d3d', 2200],
  dodge: ['¡Te esquivó!', '#ffb02e', 1000],
  ice: ['Hielo: frena antes', '#8fd3ff', 1600],
};
let timer: ReturnType<typeof setTimeout> | undefined;

export function showNote(kind: BuzzKind) {
  const note = NOTES[kind];
  const el = document.getElementById('slip');
  if (!note || !el) return;
  el.textContent = note[0];
  el.style.color = note[1];
  el.classList.add('on');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('on'), note[2]);
}
