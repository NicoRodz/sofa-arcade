// The start menu's card grid as a lit-html template, drawn into #menucards (view.html). Cards are keyed by game id, so each keeps its node (and the
// canvas with its art, drawn once by the caller) while only the class, the notice and the text that changed are updated. The class goes through
// classMap on purpose: it leaves alone the `nope` class that menuAct adds by hand for its shake animation.
import { classMap, html, nothing, renderInto, repeat } from '../../ui/render';
import type { CardView, MenuView } from './model';

export const cardTemplate = (c: CardView) =>
  html`<div class="gc ${classMap({ [c.state]: true, sel: c.selected })}" data-game=${c.pickable ? c.id : nothing} data-card=${c.id}><canvas class="art"></canvas><div class="body"><div class="nm">${c.name}</div><div class="bl">${c.blurb}</div>${c.range ? html`<div class="pl">${c.range}</div>` : nothing}</div><div class="tag">${c.notice}</div></div>`;

export const menuTemplate = (m: MenuView) => html`${repeat(m.cards, (c) => c.id, cardTemplate)}`;

const drawn = new WeakSet<HTMLCanvasElement>();

// `drawArt` runs once per card canvas (the first time it appears), never on later renders: the idle animation of the art must not restart.
export function renderMenuCards(m: MenuView, drawArt: (canvas: HTMLCanvasElement, id: string) => void): void {
  renderInto('menucards', menuTemplate(m));
  for (const el of Array.from(document.getElementById('menucards')!.children)) {
    const canvas = el.querySelector('canvas');
    if (canvas && !drawn.has(canvas)) {
      drawn.add(canvas);
      drawArt(canvas, (el as HTMLElement).dataset.card!);
    }
  }
}
