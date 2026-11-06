// The campaign's screens as data: the hub's items, the trail of a world, the practice rows and the buttons after a level (moved out of model.ts, which keeps the keys).
import {
  bossOf,
  campaignOrder,
  continueLabel,
  continueLevel,
  isUnlocked,
  isWorldUnlocked,
  pathOf,
  playableWith,
  progressOf,
  summitNeed,
  summitOf,
  summitState,
  worldById,
  worldStars,
  maxStarsOf,
  type Catalog,
  type CatalogLevel,
  type Expedition,
  type Stars,
} from '../../campaign/index';
import type { Hub, Outcome } from './flow';

// ---- the hub
export type HubItemId = 'continue' | 'pick' | 'new' | 'newSkip' | 'practice' | 'quick';
export interface HubItem {
  id: HubItemId;
  label: string;
  sub: string;
  disabled: string;
} // disabled: why it cannot be picked ('' = it can)
export function hubItems(hub: Hub, c: Catalog, n: number): HubItem[] {
  const out: HubItem[] = [];
  const need = n < 2 ? 'Hacen falta 2 jugadores' : '';
  if (hub.last) out.push({ id: 'continue', label: continueLabel(hub.last, c), sub: '', disabled: need });
  if (hub.list.length > 1)
    out.push({ id: 'pick', label: `Otra expedición (${hub.list.length})`, sub: 'Elegir una guardada', disabled: '' });
  out.push({ id: 'new', label: 'Nueva expedición', sub: 'Empieza desde el primer nivel', disabled: need });
  if (c.worlds.length > 1)
    out.push({ id: 'newSkip', label: 'Nueva · ya sabemos escalar', sub: `Abre ${c.worlds[1]!.name} de entrada`, disabled: need });
  out.push({
    id: 'practice',
    label: 'Sala de práctica',
    sub: c.practice.length ? 'Una estación por acción, sin corazones' : 'Próximamente',
    disabled: c.practice.length ? need : 'Próximamente',
  });
  out.push({ id: 'quick', label: 'Partida rápida', sub: 'Tres niveles al tiro, sin guardar', disabled: '' });
  return out;
}

// ---- the trail of a world
export type NodeState = 'locked' | 'open' | 'done' | 'skipped' | 'hidden';
export interface MapNode {
  levelId: string;
  tag: string;
  name: string;
  kind: CatalogLevel['kind'];
  state: NodeState;
  stars: Stars;
  starCount: number;
  medal: boolean;
  bestTimeMs: number | null;
  playable: boolean; // validated for the players that are here
  why: string; // what stops it (closed, or not for this many players); '' when it can be played
}
const lockedWhy = (e: Expedition, c: Catalog, l: CatalogLevel): string => {
  if (l.kind === 'summit')
    return `Reúne ${summitNeed(c, l.world)}★ en ${worldById(c, l.world)?.name ?? ''} (${worldStars(e, c, l.world)}★)`;
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
    return {
      levelId: l.id,
      tag: l.kind === 'summit' ? 'Cumbre' : l.id,
      name: hidden ? '???' : l.name,
      kind: l.kind,
      state,
      stars: p.stars,
      starCount: p.stars.filter(Boolean).length,
      medal: p.timeMedal,
      bestTimeMs: p.bestTimeMs,
      playable,
      why,
    };
  });
}
export interface WorldTab {
  id: string;
  name: string;
  biome: string;
  open: boolean;
  stars: number;
  max: number;
  boss: boolean;
}
export const worldTabs = (e: Expedition, c: Catalog): WorldTab[] =>
  c.worlds.map((w) => {
    const boss = bossOf(c, w.id);
    return {
      id: w.id,
      name: w.name,
      biome: w.biome,
      open: isWorldUnlocked(e, c, w.id),
      stars: worldStars(e, c, w.id),
      max: maxStarsOf(c, w.id),
      boss: !!boss && progressOf(e, boss.id).done,
    };
  });
// Where the nodes sit on the trail (fractions of the width and height): a gentle zigzag from left to right.
export function trailPoints(count: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_v, i) => ({
    x: count === 1 ? 0.5 : 0.07 + (0.86 * i) / (count - 1),
    y: 0.5 + (i % 2 === 0 ? 0.13 : -0.13) * (i % 4 < 2 ? 1 : 0.55),
  }));
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
export interface StationRow {
  levelId: string;
  name: string;
  open: boolean;
  why: string;
}
export function practiceRows(e: Expedition | null, c: Catalog, n: number): StationRow[] {
  const first = campaignOrder(c)[0]?.id;
  return c.practice.map((s) => {
    const opensAt = s.opensAt ?? '';
    const open = e ? isUnlocked(e, c, opensAt) : opensAt === first;
    const fits = s.validatedFor.includes(n);
    return {
      levelId: s.id,
      name: s.name,
      open: open && fits,
      why: !open ? `Se abre en ${opensAt}` : !fits ? `Validada para ${s.validatedFor.join(', ')} jug.` : '',
    };
  });
}

// ---- the buttons after a level
export type ResultButton = 'next' | 'retry' | 'skip' | 'map';
export function resultButtons(o: Outcome): { id: ResultButton; label: string }[] {
  const out: { id: ResultButton; label: string }[] = [];
  if (o.practice)
    return [
      { id: 'retry', label: o.cleared ? 'Otra vez' : 'Reintentar' },
      { id: 'map', label: 'Estaciones' },
    ];
  if (o.cleared && o.next) out.push({ id: 'next', label: `Siguiente · ${o.next.id}` });
  out.push({ id: 'retry', label: o.cleared ? 'Repetir' : 'Reintentar' });
  if (o.canSkip) out.push({ id: 'skip', label: 'Saltar nivel' });
  out.push({ id: 'map', label: 'Mapa' });
  return out;
}
