// The campaign's screens as data and keys (no DOM): the hub's items, the trail of a world, the buttons after a level, and what every key does in each.
// view.ts draws it, main.ts feeds it keys (the Mac's or the Captain's D-pad, which arrive as the same keys) and acts on the effect it returns.
import {
  bossOf, campaignOrder, continueLabel, continueLevel, isUnlocked, isWorldUnlocked, pathOf, playableWith, progressOf, summitNeed, summitOf, summitState, worldById, worldStars,
  maxStarsOf, type Catalog, type CatalogLevel, type Expedition, type Stars,
} from '@party/shared/obstaculos/campaign';
import type { Hub, Outcome } from './flow';

export const RESET_HOLD_MS = 3000; // the Captain waits this long before the reset can be confirmed (plan §6)
export const RESET_WINDOW_MS = 12_000; // and has this long to confirm before it disarms

// ---- the hub
export type HubItemId = 'continue' | 'pick' | 'new' | 'newSkip' | 'practice' | 'quick';
export interface HubItem { id: HubItemId; label: string; sub: string; disabled: string } // disabled: why it cannot be picked ('' = it can)
export function hubItems(hub: Hub, c: Catalog, n: number): HubItem[] {
  const out: HubItem[] = [];
  const need = n < 2 ? 'Hacen falta 2 jugadores' : '';
  if (hub.last) out.push({ id: 'continue', label: continueLabel(hub.last, c), sub: '', disabled: need });
  if (hub.list.length > 1) out.push({ id: 'pick', label: `Otra expedición (${hub.list.length})`, sub: 'Elegir una guardada', disabled: '' });
  out.push({ id: 'new', label: 'Nueva expedición', sub: 'Empieza desde el primer nivel', disabled: need });
  if (c.worlds.length > 1) out.push({ id: 'newSkip', label: 'Nueva · ya sabemos escalar', sub: `Abre ${c.worlds[1]!.name} de entrada`, disabled: need });
  out.push({ id: 'practice', label: 'Sala de práctica', sub: c.practice.length ? 'Una estación por acción, sin corazones' : 'Próximamente', disabled: c.practice.length ? need : 'Próximamente' });
  out.push({ id: 'quick', label: 'Partida rápida', sub: 'Tres niveles al tiro, sin guardar', disabled: '' });
  return out;
}

// ---- the trail of a world
export type NodeState = 'locked' | 'open' | 'done' | 'skipped' | 'hidden';
export interface MapNode {
  levelId: string; tag: string; name: string; kind: CatalogLevel['kind'];
  state: NodeState; stars: Stars; starCount: number; medal: boolean; bestTimeMs: number | null;
  playable: boolean; // validated for the players that are here
  why: string; // what stops it (closed, or not for this many players); '' when it can be played
}
const lockedWhy = (e: Expedition, c: Catalog, l: CatalogLevel): string => {
  if (l.kind === 'summit') return `Reúne ${summitNeed(c, l.world)}★ en ${worldById(c, l.world)?.name ?? ''} (${worldStars(e, c, l.world)}★)`;
  const path = pathOf(c, l.world);
  const i = path.findIndex((x) => x.id === l.id);
  if (i > 0 && isWorldUnlocked(e, c, l.world)) return `Completa ${path[i - 1]!.id} primero`;
  const wi = c.worlds.findIndex((w) => w.id === l.world);
  const prev = wi > 0 ? c.worlds[wi - 1] : undefined;
  const boss = prev ? bossOf(c, prev.id) : undefined;
  return boss ? `Vence a ${boss.name} (${boss.id}) para abrir ${worldById(c, l.world)?.name ?? 'este mundo'}` : 'Todavía está cerrado';
};
export function worldNodes(e: Expedition, c: Catalog, worldId: string, n: number): MapNode[] {
  const levels = [...pathOf(c, worldId)];
  const sm = summitOf(c, worldId);
  if (sm) levels.push(sm);
  return levels.map((l) => {
    const p = progressOf(e, l.id);
    const open = isUnlocked(e, c, l.id);
    const hidden = l.kind === 'summit' && summitState(e, c, worldId) === 'hidden';
    const playable = playableWith(l, n);
    const state: NodeState = hidden ? 'hidden' : p.done ? 'done' : p.skipped ? 'skipped' : open ? 'open' : 'locked';
    const why = hidden || !open ? lockedWhy(e, c, l) : !playable ? `Validado para ${l.validatedFor.join(', ')} jug.` : '';
    return { levelId: l.id, tag: l.kind === 'summit' ? 'Cumbre' : l.id, name: hidden ? '???' : l.name, kind: l.kind, state, stars: p.stars, starCount: p.stars.filter(Boolean).length, medal: p.timeMedal, bestTimeMs: p.bestTimeMs, playable, why };
  });
}
export interface WorldTab { id: string; name: string; biome: string; open: boolean; stars: number; max: number; boss: boolean }
export const worldTabs = (e: Expedition, c: Catalog): WorldTab[] => c.worlds.map((w) => {
  const boss = bossOf(c, w.id);
  return { id: w.id, name: w.name, biome: w.biome, open: isWorldUnlocked(e, c, w.id), stars: worldStars(e, c, w.id), max: maxStarsOf(c, w.id), boss: !!boss && progressOf(e, boss.id).done };
});
// Where the nodes sit on the trail (fractions of the width and height): a gentle zigzag from left to right.
export function trailPoints(count: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_v, i) => ({ x: count === 1 ? 0.5 : 0.07 + (0.86 * i) / (count - 1), y: 0.5 + (i % 2 === 0 ? 0.13 : -0.13) * (i % 4 < 2 ? 1 : 0.55) }));
}
// The node a cursor lands on when a world is shown: the level "Continuar" offers if it is there, else the last one passed, else the first.
export function startNode(e: Expedition, c: Catalog, worldId: string, n: number): number {
  const nodes = worldNodes(e, c, worldId, n);
  const at = continueLevel(e, c);
  const i = at ? nodes.findIndex((x) => x.levelId === at.id) : -1;
  if (i >= 0) return i;
  const lastDone = nodes.map((x) => x.state === 'done' || x.state === 'skipped').lastIndexOf(true);
  return Math.max(0, lastDone);
}

// ---- the practice room: one station per action; it opens when the level that debuts its mechanic is open (nothing saved yet: only the first level's)
export interface StationRow { levelId: string; name: string; open: boolean; why: string }
export function practiceRows(e: Expedition | null, c: Catalog, n: number): StationRow[] {
  const first = campaignOrder(c)[0]?.id;
  return c.practice.map((s) => {
    const opensAt = s.opensAt ?? '';
    const open = e ? isUnlocked(e, c, opensAt) : opensAt === first;
    const fits = s.validatedFor.includes(n);
    return { levelId: s.id, name: s.name, open: open && fits, why: !open ? `Se abre en ${opensAt}` : !fits ? `Validada para ${s.validatedFor.join(', ')} jug.` : '' };
  });
}

// ---- the buttons after a level
export type ResultButton = 'next' | 'retry' | 'skip' | 'map';
export function resultButtons(o: Outcome): { id: ResultButton; label: string }[] {
  const out: { id: ResultButton; label: string }[] = [];
  if (o.practice) return [{ id: 'retry', label: o.cleared ? 'Otra vez' : 'Reintentar' }, { id: 'map', label: 'Estaciones' }];
  if (o.cleared && o.next) out.push({ id: 'next', label: `Siguiente · ${o.next.id}` });
  out.push({ id: 'retry', label: o.cleared ? 'Repetir' : 'Reintentar' });
  if (o.canSkip) out.push({ id: 'skip', label: 'Saltar nivel' });
  out.push({ id: 'map', label: 'Mapa' });
  return out;
}

// ---- keys
export type CampView = 'hub' | 'pick' | 'map' | 'result' | 'practice';
export interface CampState {
  view: CampView;
  hubSel: number; pickSel: number; resSel: number; pracSel: number;
  world: string; node: number;
  resetArmedAt: number | null; // the Captain pressed "?" on an expedition: the reset can be confirmed after RESET_HOLD_MS
  notice: string;
}
export const initialState = (): CampState => ({ view: 'hub', hubSel: 0, pickSel: 0, resSel: 0, pracSel: 0, world: '', node: 0, resetArmedAt: null, notice: '' });

export interface KeyCtx {
  now: number;
  hub: Hub;
  exp: Expedition | null; // the open one (map, result)
  catalog: Catalog;
  n: number; // players here
  outcome: Outcome | null;
}
export type Effect =
  | { t: 'continue' } | { t: 'new'; skipIntro: boolean } | { t: 'open'; id: string } | { t: 'quick' } | { t: 'menu' }
  | { t: 'play'; levelId: string } | { t: 'practicePlay'; levelId: string }
  | { t: 'reset'; id: string }
  | { t: 'result'; button: ResultButton }
  | { t: 'leave' } // back from the map to the hub (the expedition is released)
  | { t: 'refuse'; reason: string }
  | { t: 'move' };
export interface KeyOut { state: CampState; effect: Effect | null }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const DIR: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

// Which expedition the Captain's "?" would reset: the highlighted one in the hub's "continue" or in the list.
export function resetTarget(s: CampState, ctx: KeyCtx): string | null {
  if (s.view === 'pick') return ctx.hub.list[s.pickSel]?.id ?? null;
  if (s.view === 'hub') return hubItems(ctx.hub, ctx.catalog, ctx.n)[s.hubSel]?.id === 'continue' ? ctx.hub.last?.id ?? null : null;
  if (s.view === 'map') return ctx.exp?.id ?? null;
  return null;
}
export const resetReady = (s: CampState, now: number): boolean => s.resetArmedAt !== null && now - s.resetArmedAt >= RESET_HOLD_MS && now - s.resetArmedAt <= RESET_WINDOW_MS;
export const resetLeftMs = (s: CampState, now: number): number => (s.resetArmedAt === null ? 0 : Math.max(0, RESET_HOLD_MS - (now - s.resetArmedAt)));

export function campKey(s0: CampState, key: string, ctx: KeyCtx): KeyOut {
  let s: CampState = { ...s0 };
  const out = (effect: Effect | null = null): KeyOut => ({ state: s, effect });
  const armed = s.resetArmedAt !== null && ctx.now - s.resetArmedAt <= RESET_WINDOW_MS;
  if (s.resetArmedAt !== null && !armed) s = { ...s, resetArmedAt: null }; // the window ran out

  // The reset: "?" arms it, the Captain waits 3 s, OK confirms, anything else cancels.
  if (s.resetArmedAt !== null) {
    if (key === 'Enter' || key === ' ') {
      const id = resetTarget(s, ctx);
      if (id && resetReady(s, ctx.now)) { s = { ...s, resetArmedAt: null, notice: '' }; return out({ t: 'reset', id }); }
      return out({ t: 'refuse', reason: `Espera ${Math.ceil(resetLeftMs(s, ctx.now) / 1000)} s para confirmar` });
    }
    s = { ...s, resetArmedAt: null, notice: '' };
    if (key === 'Escape' || key === 'h' || key === 'H') return out();
  } else if ((key === 'h' || key === 'H') && s.view !== 'result') {
    if (!resetTarget(s, ctx)) return out({ t: 'refuse', reason: 'Elige una expedición para reiniciarla' });
    s = { ...s, resetArmedAt: ctx.now };
    return out();
  }
  s = { ...s, notice: '' };

  if (s.view === 'hub') {
    const items = hubItems(ctx.hub, ctx.catalog, ctx.n);
    if (key in DIR) { const sel = clamp(s.hubSel + DIR[key]!, 0, items.length - 1); const moved = sel !== s.hubSel; s = { ...s, hubSel: sel }; return out(moved ? { t: 'move' } : null); }
    if (key === 'Escape') return out({ t: 'menu' });
    if (key === 'Enter' || key === ' ') {
      const it = items[clamp(s.hubSel, 0, items.length - 1)];
      if (!it) return out();
      if (it.disabled) return out({ t: 'refuse', reason: it.disabled });
      switch (it.id) {
        case 'continue': return out({ t: 'continue' });
        case 'pick': s = { ...s, view: 'pick', pickSel: 0 }; return out({ t: 'move' });
        case 'new': return out({ t: 'new', skipIntro: false });
        case 'newSkip': return out({ t: 'new', skipIntro: true });
        case 'practice': s = { ...s, view: 'practice', pracSel: 0 }; return out({ t: 'move' });
        case 'quick': return out({ t: 'quick' });
      }
    }
    return out();
  }
  if (s.view === 'pick') {
    const list = ctx.hub.list;
    if (key in DIR) { const sel = clamp(s.pickSel + DIR[key]!, 0, list.length - 1); const moved = sel !== s.pickSel; s = { ...s, pickSel: sel }; return out(moved ? { t: 'move' } : null); }
    if (key === 'Escape') { s = { ...s, view: 'hub' }; return out({ t: 'move' }); }
    if ((key === 'Enter' || key === ' ') && list[s.pickSel]) return out({ t: 'open', id: list[s.pickSel]!.id });
    return out();
  }
  if (s.view === 'practice') {
    const rows = practiceRows(ctx.exp ?? ctx.hub.last, ctx.catalog, ctx.n);
    if (key in DIR) { const sel = clamp(s.pracSel + DIR[key]!, 0, rows.length - 1); const moved = sel !== s.pracSel; s = { ...s, pracSel: sel }; return out(moved ? { t: 'move' } : null); }
    if (key === 'Escape') { s = { ...s, view: 'hub' }; return out({ t: 'move' }); }
    if (key === 'Enter' || key === ' ') {
      const r = rows[clamp(s.pracSel, 0, rows.length - 1)];
      if (!r) return out();
      return r.open ? out({ t: 'practicePlay', levelId: r.levelId }) : out({ t: 'refuse', reason: r.why });
    }
    return out();
  }
  if (s.view === 'map' && ctx.exp) {
    const e = ctx.exp, c = ctx.catalog;
    const nodes = worldNodes(e, c, s.world, ctx.n);
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const node = clamp(s.node + (key === 'ArrowLeft' ? -1 : 1), 0, nodes.length - 1);
      const moved = node !== s.node; s = { ...s, node }; return out(moved ? { t: 'move' } : null);
    }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const wi = c.worlds.findIndex((w) => w.id === s.world);
      const to = c.worlds[clamp(wi + (key === 'ArrowUp' ? -1 : 1), 0, c.worlds.length - 1)]!;
      if (to.id === s.world) return out();
      s = { ...s, world: to.id, node: startNode(e, c, to.id, ctx.n) };
      return out({ t: 'move' });
    }
    if (key === 'Escape') return out({ t: 'leave' });
    if (key === 'Enter' || key === ' ') {
      const nd = nodes[clamp(s.node, 0, nodes.length - 1)];
      if (!nd) return out();
      if (nd.state === 'hidden' || nd.state === 'locked' || !nd.playable) return out({ t: 'refuse', reason: nd.why || 'Todavía está cerrado' });
      return out({ t: 'play', levelId: nd.levelId });
    }
    return out();
  }
  if (s.view === 'result' && ctx.outcome) {
    const btns = resultButtons(ctx.outcome);
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
      const sel = clamp(s.resSel + DIR[key]!, 0, btns.length - 1); const moved = sel !== s.resSel; s = { ...s, resSel: sel }; return out(moved ? { t: 'move' } : null);
    }
    if (key === 'Escape') return out({ t: 'result', button: 'map' });
    if (key === 'Enter' || key === ' ') { const b = btns[clamp(s.resSel, 0, btns.length - 1)]; return b ? out({ t: 'result', button: b.id }) : out(); }
  }
  return out();
}
