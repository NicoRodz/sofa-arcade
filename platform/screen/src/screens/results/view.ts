// The results screen's own template: the extra lines under the score, drawn into #kudos (view.html). The rest of the panel is each game's
// (games/*/screen/markup/results.html and results/view.ts), so no game markup lives in the platform.
import { html, renderInto } from '../../ui/render';
import { $ } from '../../ui/dom';
import type { KudosView } from './model';

export const kudosTemplate = (m: KudosView) => html`${m.lines.map((line) => html`<div>${line}</div>`)}`;

export const renderKudos = (m: KudosView): void => {
  renderInto('kudos', kudosTemplate(m));
  $('kudos').classList.toggle('off', m.hidden);
};
