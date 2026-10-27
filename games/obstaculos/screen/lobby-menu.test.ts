// The Obstaculos lobby form: mode, difficulty and the level grid with per-level compatibility; how a touch is judged against it.
import { describe, expect, it } from 'vitest';
import { parseMenuSnapshot, type MenuActBody } from '@pichi/core';
import { RANDOM_LEVEL } from '../lobby';
import { buildObstMenu, decideObstAct, type ObstLobbyState } from './lobby-menu';

const st = (over: Partial<ObstLobbyState> = {}): ObstLobbyState => ({
  opts: { tether: 'chain', level: 1 },
  difficulty: 'normal',
  n: 3,
  seed: 7,
  notice: '',
  ...over,
});
const act = (a: Partial<MenuActBody> & Pick<MenuActBody, 'act'>): MenuActBody => ({ rev: 1, ...a });
const grid = (s: ObstLobbyState) => buildObstMenu(s).rows.find((r) => r.id === 'level')!;

describe('buildObstMenu', () => {
  it('a mode choice, a difficulty choice and a level grid, and it survives the relay parser', () => {
    const m = buildObstMenu(st());
    expect(m.rows.map((r) => [r.id, r.kind])).toEqual([
      ['mode', 'choice'],
      ['difficulty', 'choice'],
      ['level', 'grid'],
    ]);
    expect(parseMenuSnapshot({ rev: 1, ...m })).not.toBeNull();
  });
  it('levels that do not fit the group or the mode are locked with their reason; fitFor carries the group size', () => {
    const g = grid(st({ n: 2, opts: { tether: 'free', level: 1 } }));
    const items = g.groups![0]!.items;
    expect(g.fitFor).toBe(2);
    expect(items.some((i) => !i.enabled && i.reason)).toBe(true);
    expect(items.every((i) => i.enabled || i.reason)).toBe(true);
  });
  it('the grid value is the picked level, or the random extra', () => {
    expect(grid(st()).value).toBe('lv1');
    expect(grid(st({ opts: { tether: 'chain', level: RANDOM_LEVEL } })).value).toBe('lvr');
  });
  it('start needs two players and says why when it cannot', () => {
    const p = buildObstMenu(st({ n: 1 })).primary;
    expect(p.enabled).toBe(false);
    expect(p.reason).toMatch(/2 jugadores/);
  });
});

describe('decideObstAct', () => {
  it('sets mode, difficulty and level by absolute value', () => {
    expect(decideObstAct(st(), act({ act: 'set', row: 'mode', value: 'free' }), 1)).toMatchObject({
      ok: true,
      effect: { kind: 'mode', value: 'free' },
    });
    expect(decideObstAct(st(), act({ act: 'set', row: 'difficulty', value: 'hard' }), 1)).toMatchObject({
      ok: true,
      effect: { kind: 'difficulty', value: 'hard' },
    });
    expect(decideObstAct(st(), act({ act: 'set', row: 'level', value: 'lv2' }), 1)).toMatchObject({
      ok: true,
      effect: { kind: 'level', value: 2 },
    });
    expect(decideObstAct(st(), act({ act: 'set', row: 'level', value: 'lvr' }), 1)).toMatchObject({
      ok: true,
      effect: { kind: 'level', value: RANDOM_LEVEL },
    });
  });
  it('refuses a locked level, an unknown row and an unknown option', () => {
    const locked = grid(st()).groups![0]!.items.find((i) => !i.enabled)!;
    expect(decideObstAct(st(), act({ act: 'set', row: 'level', value: locked.id }), 1)).toMatchObject({ ok: false, code: 'disabled' });
    expect(decideObstAct(st(), act({ act: 'set', row: 'nope', value: 'x' }), 1).ok).toBe(false);
    expect(decideObstAct(st(), act({ act: 'set', row: 'mode', value: 'zzz' }), 1).ok).toBe(false);
  });
  it('start needs the current revision and enough players', () => {
    expect(decideObstAct(st(), act({ act: 'start', rev: 1 }), 2)).toMatchObject({ ok: false, code: 'stale' });
    expect(decideObstAct(st({ n: 1 }), act({ act: 'start', rev: 2 }), 2)).toMatchObject({ ok: false, code: 'disabled' });
    expect(decideObstAct(st(), act({ act: 'start', rev: 2 }), 2)).toMatchObject({ ok: true, effect: { kind: 'start' } });
  });
});
