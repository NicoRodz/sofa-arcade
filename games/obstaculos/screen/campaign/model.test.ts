import { describe, expect, it } from 'vitest';
import { CAMPAIGN_CATALOG, applyResult, fullMask, newExpedition, openWorld, type Catalog, type Expedition } from '../../campaign/index';
import { planCatalog } from '../../campaign/testkit';
import type { Hub, Outcome } from './flow';
import {
  RESET_HOLD_MS,
  RESET_WINDOW_MS,
  campKey,
  hubItems,
  initialState,
  practiceRows,
  resetReady,
  resultButtons,
  startNode,
  trailPoints,
  worldNodes,
  worldTabs,
  type CampState,
  type Effect,
  type KeyCtx,
} from './model';
import { renderHub, renderMap, renderPick, renderPractice, renderResult, type ViewCtx } from './view';
import { DIFFICULTIES, DIFFICULTY_LABEL } from '@pichi/core/difficulty';

const plan = planCatalog();
// The real catalog grows with each phase (A5 built Bosque and Glaciar, A6 will add two more): the hub tests that are about "one world built" use this slice of it, so they do not move with the content.
const oneWorld: Catalog = {
  ...CAMPAIGN_CATALOG,
  worlds: CAMPAIGN_CATALOG.worlds.slice(0, 1),
  levels: CAMPAIGN_CATALOG.levels.filter((l) => l.world === '1'),
};
let clock = 1000;
const ex = (name = 'Nico y Angi') => newExpedition('exp-test0001', name, 1000);
const clearAll = (e: Expedition, c: Catalog, ids: string[], perfect = false) =>
  ids.reduce(
    (a, id) =>
      applyResult(
        a,
        c,
        { levelId: id, cleared: true, timeMs: 1000, collectiblesMask: perfect ? fullMask(3) : 0, deaths: perfect ? 0 : 4 },
        ++clock,
      ),
    e,
  );
const hubOf = (list: Expedition[], last: Expedition | null = list[0] ?? null): Hub => ({
  list: list.map((e) => ({ id: e.id, name: e.name, updatedAt: e.updatedAt, stars: 0, lastLevelId: e.lastLevelId, active: false })),
  last,
  offline: false,
});
const ctx = (o: Partial<KeyCtx> = {}): KeyCtx => ({
  now: 10_000,
  hub: hubOf([ex()]),
  exp: null,
  catalog: CAMPAIGN_CATALOG,
  n: 2,
  outcome: null,
  ...o,
});
const press = (s: CampState, key: string, c: KeyCtx) => campKey(s, key, c);
const eff = (s: CampState, key: string, c: KeyCtx): Effect | null => campKey(s, key, c).effect;

describe('hub items', () => {
  it('offers Continuar first when there is an expedition, with the label the plan asks for', () => {
    const items = hubItems(hubOf([ex()]), oneWorld, 2);
    expect(items.map((i) => i.id)).toEqual(['continue', 'new', 'practice', 'quick']); // one world built: no "ya sabemos escalar"
    expect(items[0]!.label).toBe('Continuar · Nico y Angi · Playa 1-1 · 0★');
  });
  it('has no Continuar with nothing saved, and a "pick another" entry from two expeditions on', () => {
    expect(hubItems(hubOf([]), oneWorld, 2).map((i) => i.id)).toEqual(['new', 'practice', 'quick']);
    // the real catalog has Playa, Bosque and Glaciar since A5: "ya sabemos escalar" opens the Bosque
    expect(hubItems(hubOf([]), CAMPAIGN_CATALOG, 2).find((i) => i.id === 'newSkip')).toMatchObject({
      label: 'Nueva · ya sabemos escalar',
      sub: 'Abre Bosque de entrada',
    });
    expect(hubItems(hubOf([]), plan, 2).map((i) => i.id)).toEqual(['new', 'newSkip', 'practice', 'quick']); // with a second world, "ya sabemos escalar" appears
    const two = hubItems(hubOf([ex(), { ...ex('B'), id: 'exp-test0002' }]), CAMPAIGN_CATALOG, 2);
    expect(two.find((i) => i.id === 'pick')?.label).toBe('Otra expedición (2)');
  });
  it('with fewer than two players the campaign cannot start, but the quick game entry is not blocked here', () => {
    const items = hubItems(hubOf([ex()]), oneWorld, 1);
    expect(items.filter((i) => i.disabled).map((i) => i.id)).toEqual(['continue', 'new', 'practice']);
    expect(items.find((i) => i.id === 'quick')!.disabled).toBe('');
  });
  it('the practice room is offered when the catalog has stations, announced when it has none', () => {
    expect(hubItems(hubOf([]), CAMPAIGN_CATALOG, 2).find((i) => i.id === 'practice')).toMatchObject({ disabled: '' });
    expect(hubItems(hubOf([]), plan, 2).find((i) => i.id === 'practice')).toMatchObject({ disabled: 'Próximamente' });
  });
});

describe('the trail of a world', () => {
  it('shows each node as done / open / locked with the reason, and the summit hidden until its stars are in', () => {
    let e = clearAll(ex(), plan, ['1-1', '1-2']);
    const nodes = worldNodes(e, plan, '1', 2);
    expect(nodes.map((n) => n.state)).toEqual(['done', 'done', 'open', 'locked', 'locked', 'locked', 'locked', 'hidden']);
    expect(nodes[3]!.why).toBe('Completa 1-3 primero');
    expect(nodes[7]).toMatchObject({ tag: 'Cumbre', name: '???', why: 'Reúne 15★ en Playa (2★)' });
    expect(nodes[6]!.kind).toBe('boss');
    e = clearAll(e, plan, ['1-3', '1-4', '1-5', '1-6', '1-7', '1-1', '1-2', '1-3', '1-4', '1-5'], true);
    expect(worldNodes(e, plan, '1', 2)[7]!.state).toBe('open');
  });
  it('a closed world says what opens it', () => {
    const e = ex();
    expect(worldNodes(e, plan, '2', 2)[0]).toMatchObject({ state: 'locked', why: 'Vence a Playa 7 (1-7) para abrir Bosque' });
    expect(worldNodes(openWorld(e, plan, '2', 5000), plan, '2', 2)[0]!.state).toBe('open');
  });
  it('an open level that was not validated for this many players cannot be played, and says for how many', () => {
    const n = worldNodes(ex(), plan, '1', 3)[0]!;
    expect(n).toMatchObject({ state: 'open', playable: false });
    expect(n.why).toBe('Validado para 2 jug.');
  });
  it('carries the stars, the clock medal and the best time of a played level', () => {
    const e = applyResult(ex(), plan, { levelId: '1-1', cleared: true, timeMs: 61_000, collectiblesMask: fullMask(3), deaths: 0 }, 5000);
    expect(worldNodes(e, plan, '1', 2)[0]).toMatchObject({ state: 'done', starCount: 3, medal: true, bestTimeMs: 61_000 });
  });
  it('the tabs show the stars of every world and which are open', () => {
    const e = clearAll(ex(), plan, ['1-1']);
    const t = worldTabs(e, plan);
    expect(t.map((x) => x.open)).toEqual([true, false, false, false, false]);
    expect(t[0]).toMatchObject({ stars: 1, max: 21, boss: false });
  });
  it('the cursor starts on the level Continuar offers, across worlds', () => {
    expect(startNode(ex(), plan, '1', 2)).toBe(0);
    expect(startNode(clearAll(ex(), plan, ['1-1', '1-2']), plan, '1', 2)).toBe(2);
    const done1 = clearAll(ex(), plan, ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7']);
    expect(startNode(done1, plan, '2', 2)).toBe(0);
    expect(startNode(done1, plan, '1', 2)).toBe(6); // a finished world: the last level passed
  });
  it('the trail is a left-to-right zigzag inside the map', () => {
    const p = trailPoints(8);
    expect(p).toHaveLength(8);
    expect(p.every((q) => q.x > 0 && q.x < 1 && q.y > 0.2 && q.y < 0.8)).toBe(true);
    expect([...p].sort((a, b) => a.x - b.x)).toEqual(p);
    expect(trailPoints(1)).toEqual([{ x: 0.5, y: 0.63 }]);
  });
});

describe('keys in the hub', () => {
  it('moves with the arrows without leaving the list, and each key does the one thing', () => {
    let s = initialState();
    const c = ctx({ catalog: oneWorld });
    expect(press(s, 'ArrowUp', c).effect).toBeNull(); // already on the first
    s = press(s, 'ArrowDown', c).state;
    expect(s.hubSel).toBe(1);
    expect(eff(s, 'Enter', c)).toEqual({ t: 'new', skipIntro: false });
    const cp = ctx({ catalog: plan });
    expect(eff({ ...initialState(), hubSel: 2 }, 'Enter', cp)).toEqual({ t: 'new', skipIntro: true });
    expect(press({ ...initialState(), hubSel: 2 }, 'Enter', c).state.view).toBe('practice'); // with one world, index 2 is the practice room
    expect(eff(initialState(), 'Enter', c)).toEqual({ t: 'continue' });
    expect(eff(initialState(), 'Escape', c)).toEqual({ t: 'menu' });
    s = { ...initialState(), hubSel: 3 };
    expect(eff(s, 'Enter', c)).toEqual({ t: 'quick' });
    expect(press(s, 'ArrowDown', c).state.hubSel).toBe(3);
  });
  it('a disabled item refuses with its reason', () => {
    expect(eff(initialState(), 'Enter', ctx({ n: 1 }))).toEqual({ t: 'refuse', reason: 'Hacen falta 2 jugadores' });
    expect(eff({ ...initialState(), hubSel: 3 }, 'Enter', ctx({ catalog: plan }))).toEqual({ t: 'refuse', reason: 'Próximamente' });
  });
  it('"otra expedición" opens the list; Enter opens the one highlighted; Esc goes back to the hub', () => {
    const c = ctx({ hub: hubOf([ex(), { ...ex('B'), id: 'exp-test0002' }]) });
    let s = press({ ...initialState(), hubSel: 1 }, 'Enter', c).state;
    expect(s.view).toBe('pick');
    s = press(s, 'ArrowDown', c).state;
    expect(eff(s, 'Enter', c)).toEqual({ t: 'open', id: 'exp-test0002' });
    expect(press(s, 'Escape', c).state.view).toBe('hub');
  });
});

describe('the practice room', () => {
  const c = (o: Partial<KeyCtx> = {}) => ctx({ exp: null, ...o });
  const view = (sel = 0): CampState => ({ ...initialState(), view: 'practice', pracSel: sel });
  it('opens from the hub and lists the 8 stations; without progress only the ones of the first level are open', () => {
    const rows = practiceRows(null, CAMPAIGN_CATALOG, 2);
    expect(rows.map((r) => r.open)).toEqual([true, true, false, false, false, false, false, false]);
    expect(rows[2]).toMatchObject({ name: 'Cuerda', why: 'Se abre en 1-2' });
  });
  it('a station opens when its debut level is open in the expedition', () => {
    const e = clearAll(ex(), CAMPAIGN_CATALOG, ['1-1', '1-2', '1-3']);
    expect(practiceRows(e, CAMPAIGN_CATALOG, 2).map((r) => r.open)).toEqual([true, true, true, true, true, true, false, false]); // 1-4 is open (it follows 1-3), 1-5 is not
  });
  it('Enter plays an open station and refuses a closed one with the level that opens it; Esc goes back to the hub', () => {
    expect(eff(view(0), 'Enter', c())).toEqual({ t: 'practicePlay', levelId: 'p-move' });
    expect(eff(view(2), 'Enter', c())).toEqual({ t: 'refuse', reason: 'Se abre en 1-2' });
    expect(press(view(0), 'Escape', c()).state.view).toBe('hub');
    expect(press(view(7), 'ArrowDown', c()).state.pracSel).toBe(7);
  });
  it('the buttons after a station are Otra vez and Estaciones, never a next level', () => {
    const o: Outcome = {
      levelId: 'p-move',
      cleared: true,
      timeMs: 1,
      deaths: 0,
      before: { done: false, stars: [false, false, false], bestTimeMs: null, timeMedal: false, collectiblesMask: 0, skipped: false },
      after: { done: false, stars: [false, false, false], bestTimeMs: null, timeMedal: false, collectiblesMask: 0, skipped: false },
      next: null,
      failuresInARow: 0,
      canSkip: false,
      practice: true as const,
      saved: true,
    };
    expect(resultButtons(o).map((b) => b.label)).toEqual(['Otra vez', 'Estaciones']);
  });
  it('the picture lists the stations with their lock', () => {
    const html = renderPractice(view(0), {
      ...ctx({ exp: null }),
      difficulty: 'normal',
      diffLabels: DIFFICULTY_LABEL,
      difficulties: DIFFICULTIES,
      names: [],
    });
    expect(html.match(/data-station=/g)).toHaveLength(8);
    expect(html).toContain('Se abre en 1-2');
  });
});

describe('keys on the map', () => {
  const e0 = clearAll(ex(), plan, ['1-1', '1-2']);
  const mapState = (): CampState => ({ ...initialState(), view: 'map', world: '1', node: 2 });
  const c = () => ctx({ exp: e0, catalog: plan });
  it('left and right walk the nodes and stop at the ends', () => {
    let s = mapState();
    s = press(s, 'ArrowRight', c()).state;
    expect(s.node).toBe(3);
    for (let i = 0; i < 12; i++) s = press(s, 'ArrowRight', c()).state;
    expect(s.node).toBe(7);
    for (let i = 0; i < 12; i++) s = press(s, 'ArrowLeft', c()).state;
    expect(s.node).toBe(0);
  });
  it('Enter plays an open or done level, and refuses a closed one with the reason', () => {
    expect(eff(mapState(), 'Enter', c())).toEqual({ t: 'play', levelId: '1-3' });
    expect(eff({ ...mapState(), node: 0 }, 'Enter', c())).toEqual({ t: 'play', levelId: '1-1' }); // replay
    expect(eff({ ...mapState(), node: 3 }, 'Enter', c())).toEqual({ t: 'refuse', reason: 'Completa 1-3 primero' });
    expect(eff({ ...mapState(), node: 7 }, 'Enter', c())).toEqual({ t: 'refuse', reason: 'Reúne 15★ en Playa (2★)' });
  });
  it('a level not validated for this many players refuses instead of playing', () => {
    expect(eff(mapState(), 'Enter', { ...c(), n: 3 })).toEqual({ t: 'refuse', reason: 'Validado para 2 jug.' });
  });
  it('up and down change world and land the cursor where the story is; Esc leaves the expedition', () => {
    let s = press(mapState(), 'ArrowDown', c()).state;
    expect(s).toMatchObject({ world: '2', node: 0 });
    expect(eff(s, 'Enter', c())).toEqual({ t: 'refuse', reason: 'Vence a Playa 7 (1-7) para abrir Bosque' });
    s = press(s, 'ArrowUp', c()).state;
    expect(s).toMatchObject({ world: '1', node: 2 });
    expect(press(s, 'ArrowUp', c()).effect).toBeNull(); // first world: nothing above
    expect(eff(s, 'Escape', c())).toEqual({ t: 'leave' });
  });
});

describe('keys in the results', () => {
  const o = (over: Partial<Outcome> = {}): Outcome => ({
    levelId: '1-1',
    cleared: true,
    timeMs: 5000,
    deaths: 0,
    before: { done: false, stars: [false, false, false], bestTimeMs: null, timeMedal: false, collectiblesMask: 0, skipped: false },
    after: { done: true, stars: [true, false, true], bestTimeMs: 5000, timeMedal: true, collectiblesMask: 0, skipped: false },
    next: CAMPAIGN_CATALOG.levels[1]!,
    failuresInARow: 0,
    canSkip: false,
    saved: true,
    ...over,
  });
  const st = (): CampState => ({ ...initialState(), view: 'result' });
  it('buttons: Siguiente only when it is open, Saltar only when offered', () => {
    expect(resultButtons(o()).map((b) => b.id)).toEqual(['next', 'retry', 'map']);
    expect(resultButtons(o({ next: null })).map((b) => b.id)).toEqual(['retry', 'map']);
    expect(resultButtons(o({ cleared: false, next: null, canSkip: true })).map((b) => b.id)).toEqual(['retry', 'skip', 'map']);
    expect(resultButtons(o({ cleared: false, next: CAMPAIGN_CATALOG.levels[1]! })).map((b) => b.id)).toEqual(['retry', 'map']); // never Siguiente after a failure
  });
  it('Enter does the highlighted one, the arrows move, Esc is Mapa', () => {
    const c = ctx({ outcome: o() });
    expect(eff(st(), 'Enter', c)).toEqual({ t: 'result', button: 'next' });
    const s = press(st(), 'ArrowRight', c).state;
    expect(eff(s, 'Enter', c)).toEqual({ t: 'result', button: 'retry' });
    expect(eff(s, 'Escape', c)).toEqual({ t: 'result', button: 'map' });
    expect(press(press(s, 'ArrowRight', c).state, 'ArrowRight', c).state.resSel).toBe(2);
  });
});

describe('the Captain\'s reset: "?" arms it, 3 seconds, OK confirms', () => {
  const c = (now: number) => ctx({ now });
  it('OK before 3 s is refused, OK after 3 s resets that expedition', () => {
    let s = press(initialState(), 'h', c(10_000)).state;
    expect(s.resetArmedAt).toBe(10_000);
    expect(resetReady(s, 11_000)).toBe(false);
    expect(eff(s, 'Enter', c(11_000))).toEqual({ t: 'refuse', reason: 'Espera 2 s para confirmar' });
    expect(press(s, 'Enter', c(11_000)).state.resetArmedAt).toBe(10_000); // still armed: the wait goes on
    expect(resetReady(s, 10_000 + RESET_HOLD_MS)).toBe(true);
    const out = press(s, 'Enter', c(10_000 + RESET_HOLD_MS));
    expect(out.effect).toEqual({ t: 'reset', id: 'exp-test0001' });
    expect(out.state.resetArmedAt).toBeNull();
  });
  it('any other key cancels it, and the window runs out', () => {
    const s = press(initialState(), 'h', c(10_000)).state;
    expect(press(s, 'ArrowDown', c(14_000)).state.resetArmedAt).toBeNull();
    expect(press(s, 'Escape', c(14_000)).effect).toBeNull(); // Esc cancels, it does not also go back
    const late = press(s, 'Enter', c(10_000 + RESET_WINDOW_MS + 1));
    expect(late.effect).toEqual({ t: 'continue' }); // the arm expired: Enter is a plain Enter again
  });
  it('arming needs something to reset: the highlighted Continuar, a listed expedition or the open one', () => {
    expect(eff({ ...initialState(), hubSel: 1 }, 'h', c(1))).toEqual({ t: 'refuse', reason: 'Elige una expedición para reiniciarla' });
    const e = clearAll(ex(), plan, ['1-1']);
    const m = press({ ...initialState(), view: 'map', world: '1', node: 0 }, 'h', ctx({ exp: e, catalog: plan, now: 5 })).state;
    expect(m.resetArmedAt).toBe(5);
    expect(press(m, 'Enter', ctx({ exp: e, catalog: plan, now: 5 + RESET_HOLD_MS })).effect).toEqual({ t: 'reset', id: 'exp-test0001' });
  });
  it('"?" in the results does nothing (a level was just played, not an expedition picked)', () => {
    const out = press({ ...initialState(), view: 'result' }, 'h', ctx({ outcome: null }));
    expect(out.state.resetArmedAt).toBeNull();
  });
});

describe('the pictures', () => {
  const vctx = (o: Partial<ViewCtx> = {}): ViewCtx => ({
    ...ctx(),
    difficulty: 'normal',
    diffLabels: DIFFICULTY_LABEL,
    difficulties: DIFFICULTIES,
    names: ['Nico', 'Angi'],
    ...o,
  });
  it('the hub carries the exact Continuar text and the difficulty pills', () => {
    const html = renderHub(initialState(), vctx());
    expect(html).toContain('data-label="Continuar · Nico y Angi · Playa 1-1 · 0★"');
    expect(html).toContain('data-hub="quick"');
    expect(html.match(/data-diff=/g)).toHaveLength(3);
  });
  it('a name cannot inject markup', () => {
    const evil = ex('<img src=x onerror=alert(1)>');
    const html = renderHub(initialState(), vctx({ hub: hubOf([evil]) }));
    expect(html).not.toContain('<img');
    expect(renderPick({ ...initialState(), view: 'pick' }, vctx({ hub: hubOf([evil]) }))).not.toContain('<img');
  });
  it('the map draws a node per level with its state, the lock, the boss tag and the clock', () => {
    const e = applyResult(ex(), plan, { levelId: '1-1', cleared: true, timeMs: 1000, collectiblesMask: 0, deaths: 0 }, 5000);
    const html = renderMap({ ...initialState(), view: 'map', world: '1', node: 1 }, vctx({ exp: e, catalog: plan }));
    expect(html.match(/data-node=/g)).toHaveLength(8);
    expect(html).toContain('cnode done');
    expect(html).toContain('cnode open');
    expect(html).toContain('🔒');
    expect(html).toContain('JEFE');
    expect(html).toContain('class="clk"');
    expect(html).toContain('cnode open level sel'); // the cursor
    expect(html).toContain('Nico y Angi');
    expect(html.match(/data-world=/g)).toHaveLength(5);
  });
  it('the results show the stars earned now as fresh and the buttons', () => {
    const html = renderResult(
      { ...initialState(), view: 'result' },
      {
        levelId: '1-1',
        cleared: true,
        timeMs: 5000,
        deaths: 0,
        before: { done: false, stars: [true, false, false], bestTimeMs: null, timeMedal: false, collectiblesMask: 0, skipped: false },
        after: { done: true, stars: [true, true, false], bestTimeMs: 5000, timeMedal: false, collectiblesMask: 1, skipped: false },
        next: null,
        failuresInARow: 0,
        canSkip: false,
        saved: false,
      },
      CAMPAIGN_CATALOG,
    );
    expect(html.match(/class="rs on fresh"/g)).toHaveLength(1); // only the second star is new
    expect(html).toContain('No se pudo guardar');
    expect(html.match(/data-res=/g)).toHaveLength(2);
  });
});
