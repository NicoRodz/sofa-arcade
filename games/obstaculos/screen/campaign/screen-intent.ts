// The pure parts of CampaignScreen: which panel a state draws, what a click means, and where the map cursor lands after a result.
import { nextLevel, type Catalog } from '../../campaign/index';
import type { Difficulty } from '@pichi/core';
import { hubItems, startNode, worldNodes, type CampState } from './model';
import { renderHub, renderMap, renderPick, renderPractice, type ViewCtx } from './view';
import type { CampaignFlow, Hub } from './flow';

type Exp = CampaignFlow['exp'];
type Outcome = NonNullable<CampaignFlow['outcome']>;
export type ResultButton = 'next' | 'retry' | 'skip' | 'map';

// The lobby panel of the campaign for this state (a map without an expedition falls back to the hub).
export function campaignHtml(s: CampState, c: ViewCtx): string {
  return s.view === 'pick'
    ? renderPick(s, c)
    : s.view === 'practice'
      ? renderPractice(s, c)
      : s.view === 'map' && c.exp
        ? renderMap(s, c)
        : renderHub(s.view === 'hub' ? s : { ...s, view: 'hub' }, c);
}

export type ClickIntent =
  | { t: 'difficulty'; d: Difficulty }
  | { t: 'press'; patch: Partial<CampState> } // move there and press Enter
  | { t: 'select'; patch: Partial<CampState> } // move there only
  | { t: 'result'; button: ResultButton };
export interface ClickCtx {
  state: CampState;
  hub: Hub;
  catalog: Catalog;
  exp: Exp;
  n: number; // connected players
  difficulties(): readonly Difficulty[];
}

// A click is the same as moving there and pressing Enter; null when it hits nothing (or something that does not apply to the current view).
export function clickIntent(el: HTMLElement, c: ClickCtx): ClickIntent | null {
  const hit = (sel: string) => el.closest<HTMLElement>(sel);
  const diff = hit('[data-diff]')?.dataset.diff;
  if (diff) {
    const d = c.difficulties().find((x) => x === diff);
    return d ? { t: 'difficulty', d } : null;
  }
  const h = hit('[data-hub]')?.dataset.hub;
  if (h && c.state.view === 'hub') {
    const idx = hubItems(c.hub, c.catalog, c.n).findIndex((x) => x.id === h);
    return idx >= 0 ? { t: 'press', patch: { hubSel: idx } } : null;
  }
  const st = hit('[data-station]')?.dataset.station;
  if (st && c.state.view === 'practice') {
    const idx = c.catalog.practice.findIndex((x) => x.id === st);
    return idx >= 0 ? { t: 'press', patch: { pracSel: idx } } : null;
  }
  const p = hit('[data-pick]')?.dataset.pick;
  if (p) {
    const idx = c.hub.list.findIndex((x) => x.id === p);
    return idx >= 0 ? { t: 'press', patch: { pickSel: idx } } : null;
  }
  const nd = hit('[data-node]')?.dataset.node;
  if (nd !== undefined) return { t: 'press', patch: { node: Number(nd) } };
  const w = hit('[data-world]')?.dataset.world;
  if (w && c.exp) return { t: 'select', patch: { world: w, node: startNode(c.exp, c.catalog, w, c.n) } };
  const r = hit('[data-res]')?.dataset.res;
  return r ? { t: 'result', button: r as ResultButton } : null;
}

// Mapa (and Saltar, which lands there with the next level open): the cursor lands on the next open level after a clear or a skip, on the same level after a failure.
export function landOnMap(state: CampState, o: Outcome, button: ResultButton, exp: Exp, catalog: Catalog, n: number): CampState {
  const forward = (button === 'skip' || o.cleared) && exp ? nextLevel(exp, catalog, o.levelId) : null;
  const at = forward ?? catalog.levels.find((l) => l.id === o.levelId);
  const world = at?.world ?? state.world;
  return {
    ...state,
    view: 'map',
    world,
    node: exp
      ? Math.max(
          0,
          worldNodes(exp, catalog, world, n).findIndex((x) => x.levelId === (at?.id ?? o.levelId)),
        )
      : 0,
    notice: '',
  };
}
