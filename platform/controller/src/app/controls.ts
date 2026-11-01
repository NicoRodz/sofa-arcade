// The stick and the two buttons: labels and icons come from the game registry via the config message (nothing here knows a specific game).
// The circle (the touch area) carries the icon only; the label goes in a plate underneath, outside the touch area.
// The screen may rename A and B for a moment (sabotage: "Tomar bolsa", "Cargar", "¡Lanzar!"): `hint` overrides the registry label, null brings it back.
import type { HintLabels } from '@pichi/core';
import type { GameControls } from '@pichi/core/contract';
import { esc, iconSvg } from '@pichi/core/render';
import type { IconId } from '@pichi/core/icons';
import type { Session } from './store';

function setControl(circle: HTMLElement, plate: HTMLElement, c: GameControls['stick']) {
  circle.innerHTML = iconSvg(c.icon);
  plate.innerHTML = `<div class="pl"><span class="lbl">${esc(c.label)}</span>${c.hold ? '<span class="hold">mantén apretado</span>' : ''}</div>`;
}
// A long label shrinks (down to 8px) until it fits its plate instead of spilling over the neighbours.
function fitLabels(root: HTMLElement) {
  for (const pl of Array.from(root.querySelectorAll<HTMLElement>('.plq .pl'))) {
    const spans = Array.from(pl.querySelectorAll<HTMLElement>('.lbl, .hold'));
    for (const sp of spans) sp.style.fontSize = '';
    const avail = () => pl.parentElement!.clientWidth + 10 - 16; // plate: control width + 10, minus its side padding
    for (const sp of spans) {
      let size = parseFloat(getComputedStyle(sp).fontSize);
      while (sp.scrollWidth > avail() + 0.5 && size > 8) {
        size -= 0.5;
        sp.style.fontSize = `${size}px`;
      }
    }
  }
}
// A hint with a label also brings its icon and whether there is anything to do; the "mantén apretado" line only belongs to the game's own B.
const hinted = (base: GameControls['btn1'], label: string | null, icon: IconId | undefined, hold: boolean): GameControls['btn1'] =>
  label ? { ...base, label, ...(icon ? { icon } : {}), hold } : base;
const sameHint = (x: HintLabels, y: HintLabels) =>
  x.a === y.a && x.b === y.b && x.aIcon === y.aIcon && x.bIcon === y.bIcon && !!x.aOff === !!y.aOff && !!x.bOff === !!y.bOff;

export interface Controls {
  apply(c?: GameControls | null): void;
  /** Every hint is a whole state, so the latest one is the truth. */
  setHint(h: HintLabels): void;
}

export function createControls(s: Session): Controls {
  const { $ } = s;
  const apply = (c: GameControls | null = s.controls) => {
    if (!c) return;
    s.controls = c;
    const h = s.hint;
    setControl($('stickhint'), $('stickLbl'), c.stick);
    setControl($('btnA'), $('lblA'), hinted(c.btn1, h.a, h.aIcon, !!c.btn1.hold));
    setControl($('btnB'), $('lblB'), hinted(c.btn2, h.b, h.bIcon, false));
    for (const [id, lbl, isOff] of [
      ['btnA', 'lblA', h.aOff],
      ['btnB', 'lblB', h.bOff],
    ] as const) {
      $(id).classList.toggle('off', !!isOff);
      $(lbl).classList.toggle('off', !!isOff);
    }
    fitLabels(s.root);
  };
  window.addEventListener('resize', () => fitLabels(s.root));
  return {
    apply,
    setHint(h) {
      if (sameHint(s.hint, h)) return;
      s.hint = h;
      apply();
    },
  };
}
