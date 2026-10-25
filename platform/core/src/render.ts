// HTML for control labels and the "how to play" steps. Both the phones and the big screen use it and style the classes.
import { ICONS, type IconId } from './icons';
import type { ControlLabel, HowTo } from './games';

export const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const iconSvg = (id: IconId): string =>
  `<svg class="ico" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id]}</svg>`;

export const controlHtml = (c: ControlLabel): string =>
  `${iconSvg(c.icon)}<span class="lbl">${esc(c.label)}</span>${c.hold ? '<span class="hold">mantén apretado</span>' : ''}`;

export const howToHtml = (h: HowTo): string =>
  `<ol class="steps">${h.steps.map((s, i) => `<li><span class="n">${i + 1}</span><span class="ic">${iconSvg(s.icon)}</span><span class="tx">${esc(s.text)}</span></li>`).join('')}</ol>` +
  (h.note ? `<div class="note"><span class="ic">${iconSvg('star')}</span>${esc(h.note)}</div>` : '');
