// The campaign's screens as HTML strings (pure: the DOM only receives them). Classes and ids are styled in apps/screen/index.html under "Campaign".
import { continueLevel, levelById, levelTag, totalStars, worldById, type Catalog } from '../../campaign/index';
import type { Biome } from '../../index';
import type { Outcome } from './flow';
import {
  hubItems,
  practiceRows,
  resetLeftMs,
  resetReady,
  resultButtons,
  trailPoints,
  worldNodes,
  worldTabs,
  type CampState,
  type KeyCtx,
  type MapNode,
} from './model';
import type { Difficulty } from '@pichi/core';

export const BIOME_COLOR: Record<Biome, string> = {
  beach: '#F2D49B',
  forest: '#6FA85A',
  mine: '#C98A55',
  glacier: '#BFE8F5',
  volcano: '#F0783C',
};
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const starRow = (flags: readonly boolean[]) => flags.map((f) => `<b${f ? ' class="on"' : ''}>★</b>`).join('');

export interface ViewCtx extends KeyCtx {
  difficulty: Difficulty;
  diffLabels: Record<Difficulty, string>;
  difficulties: readonly Difficulty[];
  names: readonly string[];
}

function resetBanner(s: CampState, ctx: ViewCtx): string {
  if (s.resetArmedAt === null) return '';
  const target = ctx.hub.list.find(
    (x) => x.id === (s.view === 'map' ? ctx.exp?.id : s.view === 'pick' ? ctx.hub.list[s.pickSel]?.id : ctx.hub.last?.id),
  );
  const name = esc(target?.name ?? ctx.exp?.name ?? ctx.hub.last?.name ?? '');
  const ready = resetReady(s, ctx.now);
  return (
    `<div class="creset${ready ? ' ready' : ''}"><b>¿Reiniciar «${name}»?</b> ` +
    (ready
      ? 'Pulsa <kbd>OK</kbd> para confirmar · cualquier otra tecla cancela'
      : `Espera ${Math.ceil(resetLeftMs(s, ctx.now) / 1000)} s…`) +
    ' <small>Se guarda en la papelera: se puede recuperar.</small></div>'
  );
}

export function renderHub(s: CampState, ctx: ViewCtx): string {
  const items = hubItems(ctx.hub, ctx.catalog, ctx.n);
  const cls = (i: number, dis: string) => `${i === s.hubSel ? ' sel' : ''}${dis ? ' dis' : ''}`;
  const parts: string[] = [];
  items.forEach((it, i) => {
    if (it.id === 'continue') {
      const next = ctx.hub.last ? continueLevel(ctx.hub.last, ctx.catalog) : null;
      parts.push(
        `<button class="cbig${cls(i, it.disabled)}" data-hub="${it.id}" data-label="${esc(it.label)}"><span class="play">▶</span><span class="lbl">${esc(it.label)}</span>` +
          `<span class="sub">${next ? `Sigue: ${esc(next.name)}` : '¡Campaña completa! Repite niveles para sumar estrellas'}${it.disabled ? ` · ${esc(it.disabled)}` : ''}</span></button>`,
      );
    } else
      parts.push(
        `<button class="citem${cls(i, it.disabled)}" data-hub="${it.id}"><b>${esc(it.label)}</b><span>${esc(it.sub)}</span></button>`,
      );
  });
  const off = ctx.hub.offline
    ? '<div class="cwarn">No se pudo hablar con el servidor: el progreso no se guardará hasta que vuelva.</div>'
    : '';
  const diffs = ctx.difficulties
    .map((d) => `<button class="pill ${d === ctx.difficulty ? 'sel' : ''}" data-diff="${d}">${esc(ctx.diffLabels[d])}</button>`)
    .join('');
  return (
    `<div class="chead"><h3>Campaña · Obstáculos en cadena</h3><span class="cnote">${esc(s.notice)}</span></div>${off}<div class="chub">${parts.join('')}</div>` +
    (s.resetArmedAt !== null
      ? resetBanner(s, ctx)
      : `<div class="cfoot"><span class="cdiff">Dificultad ${diffs}</span><span class="ckeys"><kbd>↑</kbd><kbd>↓</kbd> elegir · <kbd>Enter</kbd> OK · <kbd>?</kbd> reiniciar · <kbd>Esc</kbd> atrás</span></div>`)
  );
}

export function renderPractice(s: CampState, ctx: ViewCtx): string {
  const rows = practiceRows(ctx.exp ?? ctx.hub.last, ctx.catalog, ctx.n);
  const cells = rows
    .map(
      (r, i) =>
        `<button class="citem${i === s.pracSel ? ' sel' : ''}${r.open ? '' : ' dis'}" data-station="${esc(r.levelId)}"><b>${r.open ? '▶ ' : '🔒 '}${esc(r.name)}</b><span>${r.open ? 'Sin corazones · con aro de meta' : esc(r.why)}</span></button>`,
    )
    .join('');
  return (
    `<div class="chead"><h3>Sala de práctica</h3><span class="cnote">${esc(s.notice)}</span></div><div class="chub">${cells}</div>` +
    '<div class="cfoot"><span class="ckeys"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> elegir · <kbd>Enter</kbd> practicar · <kbd>Esc</kbd> atrás</span></div>'
  );
}
export function renderPick(s: CampState, ctx: ViewCtx): string {
  const rows = ctx.hub.list
    .map(
      (x, i) =>
        `<button class="citem row${i === s.pickSel ? ' sel' : ''}" data-pick="${esc(x.id)}"><b>${esc(x.name)}</b><span>${x.stars}★${x.active ? ' · jugando en otra sala' : ''}${x.lastLevelId ? ` · último ${esc(x.lastLevelId)}` : ''}</span></button>`,
    )
    .join('');
  return (
    `<div class="chead"><h3>Elegir expedición</h3><span class="cnote">${esc(s.notice)}</span></div><div class="cpick">${rows}</div>` +
    (s.resetArmedAt !== null
      ? resetBanner(s, ctx)
      : `<div class="cfoot"><span class="ckeys"><kbd>↑</kbd><kbd>↓</kbd> elegir · <kbd>Enter</kbd> abrir · <kbd>?</kbd> reiniciar · <kbd>Esc</kbd> atrás</span></div>`)
  );
}

const nodeIcon = (n: MapNode): string => (n.state === 'locked' ? '🔒' : n.state === 'hidden' ? '?' : n.state === 'skipped' ? '»' : '');
function nodeHtml(n: MapNode, i: number, pt: { x: number; y: number }, sel: boolean): string {
  const num = n.kind === 'summit' ? '▲' : n.tag.split('-').pop();
  const lock = !n.playable && n.state !== 'locked' && n.state !== 'hidden' ? ' nop' : '';
  return (
    `<button class="cnode ${n.state} ${n.kind}${sel ? ' sel' : ''}${lock}" data-node="${i}" style="left:${(pt.x * 100).toFixed(2)}%;top:${(pt.y * 100).toFixed(2)}%">` +
    `<i class="n">${nodeIcon(n) || num}</i>` +
    (n.state === 'done' || n.state === 'open' || n.state === 'skipped'
      ? `<i class="st" data-stars="${n.starCount}">${starRow(n.stars)}</i>`
      : '') +
    (n.medal ? '<i class="clk" title="Medalla de reloj">⏱</i>' : '') +
    (n.kind === 'boss' ? '<i class="boss">JEFE</i>' : '') +
    '</button>'
  );
}
export function renderMap(s: CampState, ctx: ViewCtx): string {
  const e = ctx.exp!,
    c = ctx.catalog;
  const tabs = worldTabs(e, c)
    .map(
      (t) =>
        `<button class="ctab${t.id === s.world ? ' sel' : ''}${t.open ? '' : ' lock'}" data-world="${esc(t.id)}"><i class="bio" style="background:${BIOME_COLOR[c.worlds.find((w) => w.id === t.id)!.biome]}"></i>${t.open ? '' : '🔒 '}${esc(t.name)} <small>${t.stars}/${t.max}★</small></button>`,
    )
    .join('');
  const nodes = worldNodes(e, c, s.world, ctx.n);
  const pts = trailPoints(nodes.length);
  const w = worldById(c, s.world);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${(p.x * 1100).toFixed(1)} ${(p.y * 380).toFixed(1)}`).join(' ');
  const sel = nodes[Math.min(s.node, nodes.length - 1)];
  const info = sel
    ? `<b>${sel.kind === 'summit' ? esc(sel.state === 'hidden' ? 'Cumbre' : sel.name) : `${esc(sel.tag)} · ${esc(sel.name)}`}</b> ${sel.state === 'done' || sel.state === 'open' || sel.state === 'skipped' ? `<span class="istars">${starRow(sel.stars)}</span>` : ''}` +
      `${sel.medal ? ' <span class="iclk">⏱ medalla de reloj</span>' : ''}${sel.bestTimeMs !== null ? ` <span class="ibest">mejor ${clock(sel.bestTimeMs)}</span>` : ''}` +
      `${sel.why ? ` <span class="iwhy">${esc(sel.why)}</span>` : sel.state === 'open' || sel.state === 'done' || sel.state === 'skipped' ? ' <span class="igo">Enter · jugar</span>' : ''}`
    : '';
  const biome = w ? BIOME_COLOR[w.biome] : '#ccc';
  return (
    `<div class="chead"><b class="cname">${esc(e.name)}</b><span class="ctotal">${totalStars(e)}★</span><span class="cnote">${esc(s.notice)}</span></div>` +
    `<div class="ctabs">${tabs}</div>` +
    `<div class="cmap" style="--biome:${biome}"><svg viewBox="0 0 1100 380" preserveAspectRatio="none"><path class="trail" d="${path}"/><path class="trail2" d="${path}"/></svg>${nodes.map((n, i) => nodeHtml(n, i, pts[i]!, i === s.node)).join('')}</div>` +
    `<div class="cinfo">${info}</div>` +
    (s.resetArmedAt !== null
      ? resetBanner(s, ctx)
      : `<div class="cfoot"><span class="ckeys"><kbd>←</kbd><kbd>→</kbd> nivel · <kbd>↑</kbd><kbd>↓</kbd> mundo · <kbd>Enter</kbd> jugar · <kbd>?</kbd> reiniciar · <kbd>Esc</kbd> atrás</span></div>`)
  );
}

// The results panel after a level: stars (the ones earned now pop), the clock medal, what it cost, and the buttons.
export function renderResult(s: CampState, o: Outcome, c: Catalog): string {
  const lvl = levelById(c, o.levelId);
  const stars = [0, 1, 2]
    .map(
      (i) =>
        `<i class="rs ${o.after.stars[i] ? 'on' : ''}${o.after.stars[i] && !o.before.stars[i] ? ' fresh' : ''}" style="--i:${i}">★</i>`,
    )
    .join('');
  const labels = ['Llegar a la meta', 'Todos los coleccionables', 'Sin perder corazones'];
  const why = [0, 1, 2]
    .map(
      (i) =>
        `<li class="${o.after.stars[i] ? 'on' : ''}${o.after.stars[i] && !o.before.stars[i] ? ' fresh' : ''}">${o.after.stars[i] ? '★' : '☆'} ${labels[i]}</li>`,
    )
    .join('');
  const medal = lvl?.botMs
    ? `<div class="rmedal ${o.after.timeMedal ? 'on' : ''}${o.after.timeMedal && !o.before.timeMedal ? ' fresh' : ''}">⏱ Medalla de reloj ${o.after.timeMedal ? '✓' : `· ≤ ${clock(Math.round(lvl.botMs * 1.6))}`}</div>`
    : '';
  const btns = resultButtons(o)
    .map((b, i) => `<button class="rbtn${i === s.resSel ? ' sel' : ''}" data-res="${b.id}">${esc(b.label)}</button>`)
    .join('');
  const title = o.practice ? (o.cleared ? '¡Estación lista!' : 'Otra vez') : o.cleared ? '¡Nivel completado!' : 'Se acabaron los corazones';
  if (o.practice)
    return `<div class="rtitle win">${title}</div><div class="rname">Sala de práctica · ${esc(lvl?.name ?? '')}</div><div class="rline">Tiempo ${clock(o.timeMs)}</div><div class="rbtns">${btns}</div>`;
  return (
    `<div class="rtitle ${o.cleared ? 'win' : 'lose'}">${title}</div><div class="rname">${esc(lvl ? levelTag(c, lvl) : o.levelId)} · ${esc(lvl?.name ?? '')}</div>` +
    (o.cleared
      ? `<div class="rstars">${stars}</div><ul class="rwhy">${why}</ul>${medal}<div class="rline">Tiempo ${clock(o.timeMs)}${o.after.bestTimeMs !== null ? ` · mejor ${clock(o.after.bestTimeMs)}` : ''} · corazones perdidos ${o.deaths}</div>`
      : `<div class="rline">${o.failuresInARow > 1 ? `${o.failuresInARow} intentos seguidos sin pasar. ` : ''}${o.canSkip ? 'Pueden saltar este nivel: queda marcado sin estrellas.' : 'Respiren y prueben otra vez.'}</div>`) +
    (o.saved ? '' : '<div class="cwarn">No se pudo guardar en el servidor: se reintenta con el próximo nivel.</div>') +
    `<div class="rbtns">${btns}</div>`
  );
}
