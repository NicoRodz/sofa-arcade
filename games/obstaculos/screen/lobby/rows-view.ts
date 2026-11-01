// The Obstaculos lobby's rows as lit-html templates. #obstmodes and #obstlevels are rendered here and nothing else writes into them; every card is a keyed
// repeat item with its state in a classMap, so the focus ring the lobby adds by hand to the card under the cursor survives the next render.
import { classMap, html, renderInto, repeat, styleMap } from '@pichi/screen-kit/ui';
import type { LevelCard, ModePill } from './rows-model';

export const modePillTemplate = (p: ModePill) =>
  html`<button class="pill ${classMap({ sel: p.selected })}" data-tether=${p.id} title=${p.title}>${p.label}</button>`;
export const renderModes = (pills: readonly ModePill[]): void =>
  renderInto('obstmodes', html`${repeat(pills, (p) => p.id, modePillTemplate)}`);

export const levelTemplate = (c: LevelCard) =>
  c.random
    ? html`<button class="mc rnd ${classMap({ sel: c.selected })}" data-level=${c.level}><span class="t">Aleatorio</span><span class="m">con semilla</span></button>`
    : html`<button class="mc ${classMap({ rec: c.ok, blk: !c.ok, sel: c.selected })}" data-level=${c.level}><span class="t"><b>${c.level}</b>${c.name}</span>${
        c.ok
          ? html`<span class="m"><i class="bio" style=${styleMap({ background: c.biome })}></i>${c.range}<span class="st">${c.stars}</span></span>`
          : html`<span class="why">${c.why}</span>`
      }</button>`;
export const renderLevels = (cards: readonly LevelCard[]): void =>
  renderInto('obstlevels', html`${repeat(cards, (c) => c.level, levelTemplate)}`);
