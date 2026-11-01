// Obstaculos' expedition cards and awards as lit-html templates, drawn into #olevels and #oawards (markup/results.html). The stars, the score count-up
// and the chef canvases of the awards are nodes bound into the template; the stars and the count-up stay in ../results-panel.ts.
import { chefCanvas } from '@pichi/screen-kit/art/chef';
import { html, renderInto, styleMap } from '@pichi/screen-kit/ui';
import type { AwardCard, LevelCard } from './model';

export const levelTemplate = (c: LevelCard) =>
  html`<div class="olv${c.lost ? ' lost' : ''}"><div class="h"><span class="medal ${c.medalCls}">${c.medalGlyph}</span>${c.name}</div><div class="sub"><i class="bio" style=${styleMap({ background: c.biomeColor })}></i>${c.sub}</div><div class="row"><span>Tiempo</span><span>${c.time}</span></div><div class="row"><span>Estrellas</span><span>${c.stars}</span></div><div class="row"><span>Vidas</span><span>${c.lives}</span></div><div class="row"><span>Checkpoints</span><span>${c.checkpoints}</span></div><div class="pts">${c.pts}</div></div>`;

export const awardTemplate = (a: AwardCard) =>
  html`<div class="award" title=${a.why}>${chefCanvas(a.slot, 'happy', true)}<div><small>${a.label}</small>${a.name}</div></div>`;

export function renderExpedition(levels: readonly LevelCard[], awards: readonly AwardCard[]): void {
  renderInto('olevels', html`${levels.map(levelTemplate)}`);
  renderInto('oawards', html`${awards.map(awardTemplate)}`);
}
