// The platform's part of the lobby as lit-html templates. Each render() has a container of its own that nothing else writes into: the join card
// (#joincard), the players heading (#playersh), the difficulty pills (#diffs), the Captain's notice (#capbannerhost) and, one per slot, every player card
// (its shell, created by initChips). The avatar canvas and the Ayudante badge go in as node bindings: the same node keeps its idle animation between renders.
import { classMap, html, renderInto, renderTo, repeat, unsafeHTML } from '../../ui/render';
import { CAPTAIN_NOTICE, type ChipView, type DiffPill, type JoinView } from './model';

export const chipTemplate = (v: ChipView, avatar: Node | null, badge: Node | null) =>
  html`<div class="av">${avatar}${badge}</div><div><div class="nm">${v.name}</div><div class="sub">${v.sub.making ? html`<span class="pen">✏️</span>armando su personaje…` : v.sub.text}</div></div><div class="num">${v.num}</div><div class="mv" title="Pasar al otro equipo">⇄</div>`;

/** The classes of a chip shell. classList.toggle names each one, so the animations replayed by hand (pop, puff, hop) are left alone. */
export function paintChipShell(el: HTMLElement, v: ChipView): void {
  for (const [name, on] of Object.entries(v.classes)) el.classList.toggle(name, on);
}

export const renderChip = (el: HTMLElement, v: ChipView, avatar: Node | null, badge: Node | null): void => {
  paintChipShell(el, v);
  renderTo(el, chipTemplate(v, avatar, badge));
};

export const pillTemplate = (p: DiffPill) =>
  html`<button class="pill ${classMap({ sel: p.selected })}" data-diff=${p.id}>${p.label}</button>`;
export const diffsTemplate = (pills: readonly DiffPill[]) => html`${repeat(pills, (p) => p.id, pillTemplate)}`;
// the focus ring (a class added by hand to the pill under the cursor) survives: classMap only removes what it added
export const renderDifficulty = (pills: readonly DiffPill[]): void => renderInto('diffs', diffsTemplate(pills));

export const joinTemplate = (j: JoinView) =>
  html`<div class="lbl">Escanea y únete</div><div id="qr">${unsafeHTML(j.qrSvg)}</div><div id="code">${j.code}</div><div id="joinurl">${j.url}</div>`;
export const renderJoinCard = (j: JoinView): void => renderInto('joincard', joinTemplate(j));

export const playersTemplate = (count: string) => html`Jugadores <small id="playersn">${count}</small>`;
export const renderPlayersHeading = (count: string): void => renderInto('playersh', playersTemplate(count));

export const captainTemplate = (on: boolean) => html`<div id="capbanner" role="status" class=${classMap({ on })}>${CAPTAIN_NOTICE}</div>`;
export const renderCaptainNotice = (on: boolean): void => renderInto('capbannerhost', captainTemplate(on));
