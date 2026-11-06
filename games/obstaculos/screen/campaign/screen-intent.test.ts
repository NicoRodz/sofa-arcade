import { describe, expect, it } from 'vitest';
import { CAMPAIGN_CATALOG, applyResult, fullMask, newExpedition, type Catalog, type Expedition } from '../../campaign/index';
import { planCatalog } from '../../campaign/tools/testkit';
import { DIFFICULTIES, DIFFICULTY_LABEL } from '@pichi/core/difficulty';
import type { Hub, Outcome } from './flow';
import { initialState, type CampState } from './model';
import { campaignHtml, clickIntent, landOnMap, type ClickCtx } from './screen-intent';
import type { ViewCtx } from './view';

const plan: Catalog = planCatalog();
const ex = (): Expedition => newExpedition('exp-test0001', 'Nico y Angi', 1000);
const clear = (e: Expedition, ids: string[]) =>
  ids.reduce(
    (a, id, i) => applyResult(a, plan, { levelId: id, cleared: true, timeMs: 1000, collectiblesMask: fullMask(3), deaths: 0 }, 2000 + i),
    e,
  );
const hub = (e: Expedition | null): Hub => ({
  list: e ? [{ id: e.id, name: e.name, updatedAt: e.updatedAt, stars: 0, lastLevelId: e.lastLevelId, active: false }] : [],
  last: e,
  offline: false,
});

// An element that answers closest() for "[data-x]" selectors from the attributes it was given.
const el = (attrs: Record<string, string>) =>
  ({
    closest: (sel: string) => {
      const k = /^\[data-(\w+)\]$/.exec(sel)?.[1];
      return k !== undefined && k in attrs ? { dataset: { [k]: attrs[k] } } : null;
    },
  }) as unknown as HTMLElement;

const cctx = (o: Partial<ClickCtx> = {}): ClickCtx => ({
  state: initialState(),
  hub: hub(ex()),
  catalog: plan,
  exp: null,
  n: 2,
  difficulties: () => DIFFICULTIES,
  ...o,
});

describe('clickIntent: what a click means', () => {
  it('a difficulty pill sets that difficulty; an unknown one hits nothing', () => {
    expect(clickIntent(el({ diff: 'normal' }), cctx())).toEqual({ t: 'difficulty', d: 'normal' });
    expect(clickIntent(el({ diff: 'nope' }), cctx())).toBeNull();
  });
  it('a hub row presses its index, only while the hub is showing', () => {
    expect(clickIntent(el({ hub: 'new' }), cctx())).toEqual({ t: 'press', patch: { hubSel: 1 } }); // Continuar, Nueva...
    expect(clickIntent(el({ hub: 'nothing' }), cctx())).toBeNull();
    expect(clickIntent(el({ hub: 'new' }), cctx({ state: { ...initialState(), view: 'map' } }))).toBeNull();
  });
  it('a practice station presses its row, only in the practice room', () => {
    const id = CAMPAIGN_CATALOG.practice[1]!.id; // the plan catalog has no stations
    const c = { catalog: CAMPAIGN_CATALOG };
    expect(clickIntent(el({ station: id }), cctx({ ...c, state: { ...initialState(), view: 'practice' } }))).toEqual({
      t: 'press',
      patch: { pracSel: 1 },
    });
    expect(clickIntent(el({ station: id }), cctx(c))).toBeNull();
  });
  it('a pick row presses its index in the saved list', () => {
    expect(clickIntent(el({ pick: 'exp-test0001' }), cctx())).toEqual({ t: 'press', patch: { pickSel: 0 } });
    expect(clickIntent(el({ pick: 'exp-zzzz' }), cctx())).toBeNull();
  });
  it('a map node presses it (even node 0); a world tab only moves the cursor to that world start', () => {
    expect(clickIntent(el({ node: '0' }), cctx())).toEqual({ t: 'press', patch: { node: 0 } });
    expect(clickIntent(el({ node: '3' }), cctx())).toEqual({ t: 'press', patch: { node: 3 } });
    const e = clear(ex(), ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7']);
    expect(clickIntent(el({ world: '2' }), cctx({ exp: e }))).toEqual({ t: 'select', patch: { world: '2', node: 0 } });
    expect(clickIntent(el({ world: '2' }), cctx({ exp: null }))).toBeNull();
  });
  it('a result button reports which one; a click on nothing is null', () => {
    expect(clickIntent(el({ res: 'retry' }), cctx())).toEqual({ t: 'result', button: 'retry' });
    expect(clickIntent(el({}), cctx())).toBeNull();
  });
});

describe('landOnMap: where the cursor lands after a result', () => {
  const outcome = (levelId: string, cleared: boolean): Outcome =>
    ({ levelId, cleared, timeMs: 0, deaths: 0, next: null, failuresInARow: 0, canSkip: false, saved: true }) as unknown as Outcome;
  const base: CampState = { ...initialState(), view: 'result', world: '1', node: 5, notice: 'x' };

  it('a clear lands on the next open level, in its own world', () => {
    const e = clear(ex(), ['1-1']);
    expect(landOnMap(base, outcome('1-1', true), 'map', e, plan, 2)).toMatchObject({ view: 'map', world: '1', node: 1, notice: '' });
  });
  it('a failure stays on the same level', () => {
    const e = clear(ex(), ['1-1', '1-2']);
    expect(landOnMap(base, outcome('1-2', false), 'map', e, plan, 2)).toMatchObject({ view: 'map', world: '1', node: 1 });
  });
  it('Saltar lands on the next open level even without a clear', () => {
    const e = clear(ex(), ['1-1', '1-2']);
    expect(landOnMap(base, outcome('1-1', false), 'skip', e, plan, 2).node).toBe(1);
    expect(landOnMap(base, outcome('1-1', false), 'map', e, plan, 2).node).toBe(0);
  });
  it('without an expedition the cursor goes to node 0 and keeps the world', () => {
    expect(landOnMap(base, outcome('9-9', true), 'map', null, plan, 2)).toMatchObject({ view: 'map', world: '1', node: 0 });
  });
  it('does not mutate the state it was given', () => {
    const before = { ...base };
    landOnMap(base, outcome('1-1', true), 'map', clear(ex(), ['1-1']), plan, 2);
    expect(base).toEqual(before);
  });
});

describe('campaignHtml: which panel a state draws', () => {
  const vctx = (o: Partial<ViewCtx> = {}): ViewCtx => ({
    now: 10_000,
    hub: hub(ex()),
    exp: null,
    catalog: plan,
    n: 2,
    outcome: null,
    difficulty: 'normal',
    diffLabels: DIFFICULTY_LABEL,
    difficulties: DIFFICULTIES,
    names: ['Nico', 'Angi'],
    ...o,
  });
  it('a map without an expedition falls back to the hub; with one it draws the trail', () => {
    const hubHtml = campaignHtml(initialState(), vctx());
    expect(hubHtml).toContain('data-hub="quick"');
    expect(campaignHtml({ ...initialState(), view: 'map' }, vctx())).toBe(hubHtml);
    const e = ex();
    const mapHtml = campaignHtml({ ...initialState(), view: 'map', world: '1' }, vctx({ exp: e }));
    expect(mapHtml).toContain('data-node=');
    expect(mapHtml).not.toBe(hubHtml);
  });
  it('pick and practice have their own panels', () => {
    expect(campaignHtml({ ...initialState(), view: 'pick' }, vctx())).toContain('data-pick=');
    expect(campaignHtml({ ...initialState(), view: 'practice' }, vctx({ catalog: CAMPAIGN_CATALOG }))).toContain('data-station=');
  });
});
