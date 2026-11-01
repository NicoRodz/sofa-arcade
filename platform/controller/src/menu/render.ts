// The generic renderer of the Captain's form: a snapshot in, markup out. It draws four kinds of row (choice, toggle, buttons, grid) and three views (list, maps,
// confirmation) and knows no game: labels, options, reasons and the summary all come from the snapshot. Every touchable carries data-cm (what it does) and,
// where it picks something, data-row / data-val; whether it is enabled and why travel with it so a tap on a disabled one needs no round trip.
import type { MenuOption, MenuRow } from '@pichi/core';
import { esc } from '@pichi/core';
import { confirmReady, currentTab, flashing, gridRow, noticeOf, pickedOf, visibleItems, type MenuUi } from './state';

const CROWN =
  '<svg class="cm-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18l1-11-5 4-5-7-5 7-5-4z" fill="#FFD23F" stroke="#2B1B17" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const LOCK =
  '<svg class="cm-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>';
const stars = (n?: number) => (n ? `<span class="cm-st">${'★'.repeat(n)}</span>` : '');

const opt = (row: MenuRow, o: MenuOption, picked: boolean, val: string, extra = ''): string =>
  `<button type="button" class="cm-opt${picked ? ' sel' : ''}${o.enabled ? '' : ' off'}" data-cm="set" data-row="${esc(row.id)}" data-val="${esc(val)}" data-en="${o.enabled ? 1 : 0}" data-why="${esc(o.reason ?? '')}"${picked ? ' aria-pressed="true"' : ''}${extra}>${o.enabled ? '' : LOCK}${esc(o.label)}</button>`;

const reasons = (opts: readonly MenuOption[]): string => {
  const off = opts.filter((o) => !o.enabled && o.reason);
  return off.length ? `<div class="cm-why">${off.map((o) => `${esc(o.label)}: ${esc(o.reason!)}`).join(' · ')}</div>` : '';
};
const hint = (row: MenuRow) => (row.hint ? `<div class="cm-hint">${esc(row.hint)}</div>` : '');

function rowHtml(row: MenuRow, flash = false): string {
  const head = `<div class="cm-row${flash ? ' flash' : ''}" data-kind="${row.kind}" data-row="${esc(row.id)}"><div class="cm-lab">${esc(row.label)}</div>`;
  const options = row.options ?? [];
  if (row.kind === 'choice')
    return `${head}<div class="cm-seg">${options.map((o) => opt(row, o, o.id === row.value, o.id)).join('')}</div>${hint(row)}${reasons(options)}</div>`;
  if (row.kind === 'toggle') {
    const yes = { id: '1', label: 'Sí', enabled: true },
      no = { id: '0', label: 'No', enabled: true };
    const bool = (o: MenuOption) => `${opt(row, o, (o.id === '1') === (row.value === true), o.id, ' data-bool="1"')}`;
    return `${head}<div class="cm-seg">${bool(yes)}${bool(no)}</div>${hint(row)}</div>`;
  }
  if (row.kind === 'buttons')
    return `${head}<div class="cm-seg">${options.map((o) => `<button type="button" class="cm-opt${o.enabled ? '' : ' off'}" data-cm="press" data-row="${esc(row.id)}" data-val="${esc(o.id)}" data-en="${o.enabled ? 1 : 0}" data-why="${esc(o.reason ?? '')}">${o.enabled ? '' : LOCK}${esc(o.label)}</button>`).join('')}</div>${hint(row)}${reasons(options)}</div>`;
  const p = pickedOf(row);
  return `${head}<div class="cm-pick"><b>${esc(p?.label ?? 'Sin elegir')}</b>${p?.players ? `<span>${esc(p.players)}</span>` : ''}${stars(p?.stars)}</div><button type="button" class="cm-opt cm-more" data-cm="maps">Cambiar mapa</button>${hint(row)}</div>`;
}

function mapsHtml(ui: MenuUi): string {
  const row = gridRow(ui.snap)!;
  const tab = currentTab(ui);
  const groups = row.groups ?? [];
  const tabs =
    groups.length > 1
      ? `<div class="cm-tabs" role="tablist">${groups.map((g) => `<button type="button" role="tab" class="cm-opt${g.id === tab ? ' sel' : ''}" data-cm="tab" data-val="${esc(g.id)}" aria-selected="${g.id === tab}">${esc(g.label)}</button>`).join('')}</div>`
      : '';
  const items = visibleItems(ui, groups.find((g) => g.id === tab)?.items ?? []);
  const inGroup = groups.find((g) => g.id === tab)?.items ?? [];
  const nobody = inGroup.length > 0 && !inGroup.some((i) => i.enabled); // a page of only locked cards (the folded "Otros"): the "Aptos" filter would empty it
  const players = row.fitFor ? `${row.fitFor} ${row.fitFor === 1 ? 'jugador' : 'jugadores'}` : '';
  const fit = !row.fitFor
    ? ''
    : nobody
      ? `<div class="cm-fitnote">No sirven para ${players} · toca uno para ver por qué</div>`
      : `<button type="button" class="cm-opt cm-fit${ui.fit ? ' sel' : ''}" data-cm="fit" aria-pressed="${ui.fit}">${ui.fit ? '✓ ' : ''}Aptos para ${players}</button>`;
  const cards = items
    .map((i) => {
      const sel = i.id === row.value;
      return `<button type="button" class="cm-card${sel ? ' sel' : ''}${i.enabled ? '' : ' off'}" data-cm="set" data-row="${esc(row.id)}" data-val="${esc(i.id)}" data-en="${i.enabled ? 1 : 0}" data-why="${esc(i.reason ?? '')}"${sel ? ' aria-pressed="true"' : ''}><b>${i.enabled ? '' : LOCK}${esc(i.label)}</b><span>${esc(i.players ?? '')}${stars(i.stars)}</span>${i.reason ? `<em>${esc(i.reason)}</em>` : ''}</button>`;
    })
    .join('');
  const extras = (row.options ?? []).map((o) => opt(row, o, o.id === row.value, o.id)).join('');
  return `${tabs}${fit}<div class="cm-maps">${cards}</div><div class="cm-seg cm-extras">${extras}</div>${hint(row)}`;
}

function confirmHtml(ui: MenuUi, now: number): string {
  const p = ui.snap!.primary;
  return `<div class="cm-ask">¿Empezar la partida?</div><button type="button" class="cm-yes" data-cm="yes"${confirmReady(ui, now) ? '' : ' disabled'}>Sí, ${esc(p.label.toLowerCase())}</button><ul class="cm-sum">${p.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
}

const INTRO = `<div class="cm-introcard" role="dialog" aria-label="Primer uso">${CROWN.replace('cm-crown', 'cm-crown big')}<b>¡Eres el Capitán!</b><ol><li>Toca una opción: la pantalla la muestra.</li><li>"Cambiar mapa" los muestra todos.</li><li>¡A cocinar! para empezar.</li></ol><button type="button" class="cm-go" data-cm="intro">Entendido</button></div>`;

const SUBTITLE = { main: 'Elige y toca ¡A cocinar!', maps: 'Elige un mapa', confirm: 'Confirma para empezar' } as const;
const FOOT = { main: ['go', ''], maps: ['back', 'Listo'], confirm: ['back', 'Volver'] } as const;

function footHtml(ui: MenuUi): string {
  const p = ui.snap!.primary;
  const [footAct, footLabel] = FOOT[ui.view];
  const grid = gridRow(ui.snap);
  const picked = grid ? pickedOf(grid) : null;
  const go = footAct === 'go';
  return (
    `<footer class="cm-foot">${picked && grid ? `<div class="cm-cur"><b>${esc(picked.label)}</b>${picked.players ? `<span>${esc(picked.players)}</span>` : ''}${stars(picked.stars)}${ui.view === 'main' ? '<button type="button" class="cm-opt cm-more" data-cm="maps">Cambiar mapa</button>' : ''}</div>` : ''}` +
    `<button type="button" class="cm-go${go && !p.enabled ? ' off' : ''}${go ? '' : ' alt'}" data-cm="${footAct}" data-why="${esc(p.reason ?? '')}">${esc(go ? p.label.toUpperCase() : footLabel)}</button>` +
    `${go && !p.enabled && p.reason ? `<span class="cm-why">${esc(p.reason)}</span>` : ''}</footer>`
  );
}

/** The whole form for a state (the caller checked there is a snapshot). The first-use card (S5) replaces the list and the foot until "Entendido". */
export function menuHtml(ui: MenuUi, now: number): string {
  const snap = ui.snap!;
  const body = ui.intro
    ? INTRO
    : ui.view === 'maps'
      ? mapsHtml(ui)
      : ui.view === 'confirm'
        ? confirmHtml(ui, now)
        : snap.rows.map((r) => rowHtml(r, flashing(ui, r.id, now))).join('');
  const notice = noticeOf(ui, now);
  return (
    `<header class="cm-head">${CROWN}<div class="cm-title"><b>Eres el Capitán</b><span>${SUBTITLE[ui.view]}</span></div>` +
    `<button type="button" class="cm-sm" data-cm="help" aria-label="Cómo se juega">?</button><button type="button" class="cm-sm cm-padbtn" data-cm="pad">Mando</button></header>` +
    `<div class="cm-notice${notice ? ' on' : ''}" role="status">${esc(notice)}</div>` +
    `<div class="cm-body" data-view="${ui.intro ? 'intro' : ui.view}" data-scroll>${body}</div>` +
    (ui.intro ? '' : footHtml(ui))
  );
}
