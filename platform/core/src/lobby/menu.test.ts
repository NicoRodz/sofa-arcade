import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '@pichi/catalog';
import { MENU_CAP, parseCaps, parseMenuAct, parseMenuSnapshot, type MenuSnapshot } from './menu';

const snap = (): MenuSnapshot => ({
  rev: 3,
  screen: 'lobby',
  rows: [
    { id: 'difficulty', label: 'Dificultad', kind: 'choice', value: 'normal', options: [{ id: 'easy', label: 'Fácil', enabled: true }] },
    { id: 'events', label: 'Eventos', kind: 'toggle', value: true, hint: 'Un evento por ronda' },
    {
      id: 'map',
      label: 'Mapa',
      kind: 'grid',
      value: '1',
      groups: [{ id: 'classic', label: 'Clásicos', items: [{ id: '1', label: 'Cocina Grande', players: '2-4', stars: 2, enabled: true }] }],
      options: [{ id: 'auto', label: 'Aleatorio', enabled: false, reason: 'necesita 4+' }],
    },
  ],
  primary: { id: 'start', label: '¡A cocinar!', enabled: false, reason: 'Esperando jugadores', summary: ['Cocina Grande'] },
});

describe('menuAct: only ids, switches and a known act travel', () => {
  it('accepts the four acts with absolute values', () => {
    expect(parseMenuAct({ rev: 1, act: 'set', row: 'difficulty', value: 'hard' })).toEqual({
      rev: 1,
      act: 'set',
      row: 'difficulty',
      value: 'hard',
    });
    expect(parseMenuAct({ rev: 1, act: 'set', row: 'events', value: false })).toEqual({ rev: 1, act: 'set', row: 'events', value: false });
    expect(parseMenuAct({ rev: 0, act: 'start' })).toEqual({ rev: 0, act: 'start' });
  });
  it.each([
    [{ rev: 1, act: 'dance' }],
    [{ rev: -1, act: 'start' }],
    [{ rev: 1.5, act: 'start' }],
    [{ rev: 1, act: 'set', row: 'has space' }],
    [{ rev: 1, act: 'set', row: 'x'.repeat(33) }],
    [{ rev: 1, act: 'set', row: 'a', value: 5 }],
    [{ rev: 1, act: 'set', row: 'a', value: '<b>' }],
    [{ act: 'start' }],
  ])('refuses %j', (m) => {
    expect(parseMenuAct(m)).toBeNull();
  });
  it('drops fields it does not know (a fake `from` never survives the parse)', () => {
    const m = parseClientMessage(JSON.stringify({ t: 'menuAct', rev: 1, act: 'start', from: 7, extra: 1 }));
    expect(m).toEqual({ t: 'menuAct', rev: 1, act: 'start' });
  });
});

describe('menu snapshot', () => {
  it('round-trips a well-formed snapshot', () => {
    expect(parseMenuSnapshot(snap())).toEqual(snap());
    expect(parseClientMessage(JSON.stringify({ t: 'menu', ...snap() }))).toEqual({ t: 'menu', ...snap() });
  });
  it('refuses a malformed snapshot whole (a half-drawn form would lie)', () => {
    const bad = (f: (s: any) => void) => {
      const s: any = structuredClone(snap());
      f(s);
      return parseMenuSnapshot(s);
    };
    expect(bad((s) => (s.rows[0].kind = 'slider'))).toBeNull();
    expect(bad((s) => (s.rows[0].id = 'bad id'))).toBeNull();
    expect(bad((s) => (s.primary.id = 'stop'))).toBeNull();
    expect(bad((s) => (s.rows[2].groups[0].items[0].stars = 9))).toBeNull();
    expect(bad((s) => (s.rows = Array.from({ length: 17 }, () => s.rows[0])))).toBeNull();
    expect(bad((s) => (s.primary.summary = ['x'.repeat(81)]))).toBeNull();
    expect(bad((s) => delete s.rev)).toBeNull();
  });
  it('strips unknown fields from every level', () => {
    const s: any = structuredClone(snap());
    s.rows[0].script = 'x';
    s.rows[0].options[0].html = '<i>';
    expect(JSON.stringify(parseMenuSnapshot(s))).not.toMatch(/script|html/);
  });
});

describe('join caps', () => {
  it('is additive: a join without caps parses as before', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'join', name: 'Nico', token: 't' }))).toEqual({ t: 'join', name: 'Nico', token: 't' });
  });
  it('keeps the known shape of tokens and drops the rest', () => {
    expect(parseCaps([MENU_CAP, 'a b', 5, 'x'.repeat(40)])).toEqual([MENU_CAP]);
    expect(parseCaps('menu1')).toEqual([]);
    expect(parseClientMessage(JSON.stringify({ t: 'join', name: 'N', token: 't', caps: [MENU_CAP] }))).toMatchObject({ caps: [MENU_CAP] });
  });
});

describe('fitFor (the "Aptos para N" filter)', () => {
  it('travels on a grid row when it is a plausible group size, and is dropped or refused otherwise', () => {
    const s = snap();
    s.rows[2]!.fitFor = 4;
    expect(parseMenuSnapshot(s)!.rows[2]!.fitFor).toBe(4);
    s.rows[2]!.fitFor = 0;
    expect(parseMenuSnapshot(s)).toBeNull();
    delete s.rows[2]!.fitFor;
    expect(parseMenuSnapshot(s)!.rows[2]).not.toHaveProperty('fitFor');
  });
});
