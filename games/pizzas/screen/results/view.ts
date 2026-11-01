// Pizzas' results panel as lit-html templates, drawn into the containers of markup/results.html (#starline, #stats, #podium, #vsseries). The chef
// canvases are nodes bound into the template; the stars, the score count-up and the versus cards stay in panel.ts / versus-view.ts.
import { chefCanvas } from '@pichi/screen-kit/art/chef';
import { $, html, nothing, renderInto } from '@pichi/screen-kit/ui';
import type { PodiumEntry, StatView, SummaryView } from './model';

export const starlineTemplate = (m: SummaryView['starline']) =>
  m === null ? html`¡Tres estrellas!` : html`Próxima estrella a <b>${m.next}</b> · te faltaron <b>${m.missing}</b>`;

export const statTemplate = (s: StatView) => html`<div class="stat ${s.cls}"><b>${s.value}</b><span>${s.label}</span></div>`;

export const podiumEntryTemplate = (e: PodiumEntry) =>
  html`<div class="pod p${e.place}">${chefCanvas(e.slot, 'happy', true)}${e.crown ? html`<div class="crown">👑</div>` : nothing}<div class="step">${e.name}<small>${e.count} ${e.count === 1 ? 'pizza' : 'pizzas'}</small></div></div>`;

export const podiumTemplate = (m: readonly PodiumEntry[]) =>
  m.length ? html`${m.map(podiumEntryTemplate)}` : html`<div class="hint">Nadie alcanzó a entregar una pizza</div>`;

export function renderSummary(m: SummaryView): void {
  renderInto('starline', starlineTemplate(m.starline));
  $('starline').title = m.starlineTitle;
  renderInto('stats', html`${m.stats.map(statTemplate)}`);
  renderInto('podium', podiumTemplate(m.podium));
}

export const renderSeries = (line: string | null): void =>
  renderInto('vsseries', line === null ? html`${nothing}` : html`<small>Serie</small>${line}`);
