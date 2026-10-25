// The lobbies of Pizzas and Obstaculos driven by keys over a fake page: which row each key lands on and what it clicks.
import { beforeEach, describe, expect, it } from 'vitest';
import { currentFocus, lobbyFocusKey, resetFocus, type FocusEl, type FocusEnv } from './focus-nav-dom';
import type { RowSpec } from './focus-rows';

class El implements FocusEl {
  cls = new Set<string>();
  clicks = 0;
  constructor(...c: string[]) {
    c.forEach((x) => this.cls.add(x));
  }
  classList = {
    contains: (c: string) => this.cls.has(c),
    toggle: (c: string, f?: boolean) => ((f ?? !this.cls.has(c)) ? this.cls.add(c) : this.cls.delete(c)),
  };
  click() {
    this.clicks++;
  }
}
const seg = (...c: string[][]) => c.map((x) => new El(...x));
function page(rows: Record<string, El[]>): FocusEnv & { rows: Record<string, El[]> } {
  const roots: Record<string, El> = {};
  for (const els of Object.values(rows))
    for (const e of els) {
      const base = e.click.bind(e);
      e.click = () => {
        base();
        els.forEach((x) => x.cls.delete('sel'));
        e.cls.add('sel'); // the page re-renders with the new pick
      };
    }
  const root = (id: string) => (roots[id] ??= new El());
  return {
    rows,
    hidden: (id) => !(id in rows),
    items: (s: RowSpec) => rows[s.root] ?? [],
    root: (s: RowSpec) => (s.items === ':scope' ? (rows[s.root]?.[0] ?? null) : root(s.root)),
  };
}
const keys = (env: FocusEnv, ...k: string[]) => k.map((x) => lobbyFocusKey(x, false, env));

beforeEach(resetFocus);

describe('Pizzas lobby', () => {
  const mk = () =>
    page({
      diffs: seg(['sel'], [], []),
      modes: seg(['sel'], []),
      maps: seg(['sel'], ['blk'], [], []),
      evs: seg([], ['sel']),
      teambar: seg([], []),
      howtobtn: seg([]),
      start: seg([]),
    });
  it('walks up from Iniciar to Dificultad and changes it with right', () => {
    const env = mk();
    keys(env, 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp');
    expect(currentFocus().row).toBe('diffs');
    lobbyFocusKey('ArrowRight', false, env);
    expect(env.rows.diffs![1]!.clicks).toBe(1);
    expect(env.rows.diffs![1]!.cls.has('kfocus')).toBe(true);
  });
  it('maps: right skips the blocked map, Enter clicks it; the ring follows', () => {
    const env = mk();
    keys(env, 'ArrowUp', 'ArrowUp', 'ArrowUp'); // start -> howto -> teambar -> maps
    expect(currentFocus().row).toBe('maps');
    keys(env, 'ArrowRight', 'Enter');
    expect(env.rows.maps![2]!.clicks).toBe(1);
    expect(env.rows.maps![1]!.clicks).toBe(0);
  });
  it('Enter on Iniciar and on the how-to button: Iniciar goes to the legacy start, how-to is clicked', () => {
    const env = mk();
    expect(keys(env, 'Enter')).toEqual([false]);
    keys(env, 'ArrowUp');
    expect(keys(env, 'Enter')).toEqual([true]);
    expect(env.rows.howtobtn![0]!.clicks).toBe(1);
  });
  it('Esc is left to the legacy handler', () => {
    expect(keys(mk(), 'ArrowUp', 'Escape')).toEqual([true, false]);
  });
});

describe('Obstaculos lobby', () => {
  it('mode and level rows: difficulty, mode, levels, start', () => {
    const env = page({ diffs: seg(['sel'], []), obstmodes: seg(['sel'], []), obstlevels: seg([], [], ['sel']), start: seg([]) });
    keys(env, 'ArrowUp');
    expect(currentFocus().row).toBe('obstlevels');
    keys(env, 'ArrowLeft', 'Enter');
    expect(env.rows.obstlevels![1]!.clicks).toBe(1);
    keys(env, 'ArrowUp', 'ArrowRight');
    expect(env.rows.obstmodes![1]!.clicks).toBe(1);
  });
});
