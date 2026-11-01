// The Pizzas lobby's map panel as lit-html templates. #maps is rendered by renderMapItems and nothing else writes into it: each card is a keyed
// repeat item (its node is the same between renders) and every state is a classMap, so the focus ring the lobby adds by hand to the card under the cursor survives.
import { classMap, html, nothing, renderInto, repeat } from '@pichi/screen-kit/ui';
import type { CardView, MapItem, SpecialView } from './maps-model';

export const cardTemplate = (c: CardView) =>
  html`<button class="mc ${classMap({ top: c.top, rec: c.state === 'rec', warn: c.state === 'warn', blk: c.state === 'blk', sel: c.selected })}" data-map=${c.id}><span class="t"><b>${c.id}</b>${c.name}</span><span class="m">${c.range}<span class="st">${c.stars}</span>${c.cheese ? html`<i class="tag" title="Queso: Margarita">Q</i>` : nothing}${c.sink ? html`<i class="tag l" title="Lavado de platos">L</i>` : nothing}</span>${c.why ? html`<span class="why">${c.why}</span>` : nothing}</button>`;

export const specialTemplate = (s: SpecialView) =>
  html`<button class="mc special ${classMap({ sel: s.selected })}" data-map=${s.id} data-to=${s.to || nothing}><span class="t">${s.label}</span><span class="m">${s.sub}</span></button>`;

export const itemTemplate = (it: MapItem) => {
  switch (it.kind) {
    case 'band':
      return html`<div class="band"><div class="grp">${it.label}</div>${repeat(it.cards, (c) => c.id, cardTemplate)}</div>`;
    case 'card':
      return cardTemplate(it.card);
    case 'special':
      return specialTemplate(it.special);
    case 'fold':
      return html`<button class="mc special" data-map="group" data-to="others"><span class="t">${it.label}</span><span class="m">${it.sub}</span></button>`;
  }
};

export const mapsTemplate = (items: readonly MapItem[]) => html`${repeat(items, (it) => it.key, itemTemplate)}`;
export const renderMapItems = (items: readonly MapItem[]): void => renderInto('maps', mapsTemplate(items));
