// The Pizzas lobby's team columns, team bar and pills as lit-html templates. Each render() has a container of its own that nothing else writes into: the column
// headings (#th0, #th1), the team bar (#teambar, whose shuffle / lock / option buttons are created on the first render), and the rows of pills (#sabs, #evs, #muts,
// #modes, #sabinfo). The .tlist columns are NOT lit containers: they hold the player cards' shells, moved there by hand (teams.ts), and what lit rendered inside a
// shell travels with it (its markers are inside the shell, see platform/screen/src/screens/lobby/view.ts).
import { classMap, html, nothing, renderInto, repeat } from '@pichi/screen-kit/ui';
import type { PillView, TeambarView, TeamHeadView } from './teams-model';

export const headTemplate = (h: TeamHeadView) =>
  html`<span class="ti">${h.icon}</span>${h.name}${h.k ? html`<span class="tk" title="Multiplicador del equipo chico">×${h.k}</span>` : nothing}<small>${h.count}</small>`;
export const renderTeamHead = (i: number, h: TeamHeadView): void => renderInto(`th${i}`, headTemplate(h));

export const teambarTemplate = (v: TeambarView) =>
  html`<button id="shuffle" class="pill">Mezclar</button><button id="lock" class="pill ${classMap({ sel: v.locked })}">${v.lockLabel}</button>${repeat(
    v.options,
    (o) => o.id,
    (o) => html`<button id="opt-${o.id}" class="pill ${classMap({ on: o.on, sel: o.on })}" data-opt=${o.id}>${o.label}</button>`,
  )}<span id="teamhint" class=${classMap({ bad: v.hint.bad })}>${v.hint.text}</span>`;
let teambarClaimed = false;
export function renderTeambar(v: TeambarView): void {
  const el = document.getElementById('teambar')!;
  if (!teambarClaimed) {
    el.replaceChildren(); // the static buttons of the platform's markup: lit draws them from here on
    teambarClaimed = true;
  }
  renderInto('teambar', teambarTemplate(v));
}

export const sabPill = (p: PillView) =>
  html`<button class="pill ${classMap({ sel: p.selected })}" data-sab=${p.id} title=${p.title}>${p.label}</button>`;
export const evPill = (p: PillView) =>
  html`<button class="pill ${classMap({ sel: p.selected })}" data-ev=${p.id} title=${p.title}>${p.label}</button>`;
export const mutPill = (p: PillView) =>
  html`<button class="pill ${classMap({ sel: p.selected })}" data-mut=${p.id} title=${p.title}>${p.label}</button>`;
export const modePill = (p: PillView) =>
  html`<button class="pill ${classMap({ sel: p.selected, dis: !!p.disabled })}" data-mode=${p.id} title=${p.title}>${p.label}</button>`;
const row = (pills: readonly PillView[], one: (p: PillView) => ReturnType<typeof html>) =>
  html`${repeat(
    pills,
    (p) => p.id,
    (p) => one(p),
  )}`;
export const renderSabotagePills = (pills: readonly PillView[]): void => renderInto('sabs', row(pills, sabPill));
export const renderEventPills = (pills: readonly PillView[]): void => renderInto('evs', row(pills, evPill));
export const renderMutatePills = (pills: readonly PillView[]): void => renderInto('muts', row(pills, mutPill));
export const renderModePills = (pills: readonly PillView[]): void => renderInto('modes', row(pills, modePill));

export const sabinfoTemplate = (warn: string, blurb: string) => (warn ? html`${warn}` : html`${blurb} · <kbd>←</kbd><kbd>→</kbd>`);
export const renderSabotageInfo = (warn: string, blurb: string): void => renderInto('sabinfo', sabinfoTemplate(warn, blurb));

/** The shells of a team's players go into its column (an empty one says so). Not a lit container: it only moves nodes, and only when the order changed. */
export function placeChips(list: Pick<Element, 'children' | 'replaceChildren'>, shells: readonly (HTMLElement | undefined)[]) {
  const want: Node[] = shells.filter((el): el is HTMLElement => !!el);
  if (!want.length) {
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.textContent = 'Sin jugadores';
    want.push(note);
  }
  const cur = Array.from(list.children);
  if (want.length !== cur.length || want.some((el, j) => el !== cur[j])) list.replaceChildren(...want);
}
