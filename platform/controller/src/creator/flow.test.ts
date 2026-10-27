import { CLOTHES_BY_GENDER, FIELDS, FIELD_SIZE, defaultAppearance, sanitizeAppearance, type Appearance } from '@pichi/core';
import { describe, expect, it } from 'vitest';
import { STEPS, initialFlow, reduce, withField, type Event } from './flow';

const A = (o: Partial<Appearance> = {}): Appearance => ({ ...defaultAppearance(1), g: 1, s: 0, cl: 0, ...o });
const open = (saved: Appearance | null = null) => reduce(initialFlow(A()), { t: 'begin', saved, random: A({ hc: 4 }) }).flow;

describe('name -> creator -> done', () => {
  it('without a saved look the creator opens at once on the random look, and Listo is valid from the first moment', () => {
    const r = reduce(initialFlow(A()), { t: 'begin', saved: null, random: A({ hc: 4 }) });
    expect(r.flow.screen).toBe('creator');
    expect(r.flow.ap.hc).toBe(4);
    const d = reduce(r.flow, { t: 'done' });
    expect(d.flow.screen).toBe('closed');
    expect(d.fx).toEqual([{ k: 'save' }, { k: 'send', done: true }, { k: 'cue', cue: 'done' }]);
    expect(d.flow.saved).toEqual(r.flow.ap);
  });
  it('with a saved look it asks "¿Juegas con este?": Jugar así closes, Cambiar opens the creator', () => {
    const saved = A({ hat: 3 });
    const f = open(saved);
    expect([f.screen, f.ap, f.genderChosen]).toEqual(['confirm', saved, true]);
    expect(reduce(f, { t: 'play' }).flow.screen).toBe('closed');
    expect(reduce(f, { t: 'play' }).fx).toContainEqual({ k: 'send', done: true });
    expect(reduce(f, { t: 'change' }).flow.screen).toBe('creator');
    expect(reduce(f, { t: 'done' }).fx).toEqual([]); // Listo does not exist on the confirm screen
  });
  it('every change goes out live (done: false) and is not saved until Listo', () => {
    const r = reduce(open(), { t: 'pick', field: 'hat', value: 3 });
    expect(r.flow.ap.hat).toBe(3);
    expect(r.fx).toEqual([{ k: 'send', done: false }]);
  });
  it('a value out of range is ignored and sends nothing (sabotage target: the range guard)', () => {
    for (const value of [-1, 6, 1.5, Number.NaN, 1e9]) expect(reduce(open(), { t: 'pick', field: 'hat', value })).toMatchObject({ fx: [] });
  });
});

describe('steps', () => {
  it('gender and hair colour advance by themselves; accessories wait for Siguiente', () => {
    const g = reduce(open(), { t: 'pick', field: 'g', value: 0 }).flow;
    expect(g.step).toBe('hair');
    expect(reduce(g, { t: 'pick', field: 'hc', value: 2 }).flow.step).toBe('acc');
    expect(reduce(g, { t: 'pick', field: 's', value: 1 }).flow.step).toBe('hair'); // a chip in the same step does not move on
    const acc = reduce(open(), { t: 'step', step: 'acc' }).flow;
    expect(reduce(acc, { t: 'pick', field: 'gl', value: 2 }).flow.step).toBe('acc');
    expect(reduce(acc, { t: 'next' }).flow.step).toBe('clothes');
    expect(reduce(reduce(acc, { t: 'next' }).flow, { t: 'next' }).flow.step).toBe('clothes'); // the last step stays
  });
  it('the tabs jump between steps', () => {
    for (const s of STEPS) expect(reduce(open(), { t: 'step', step: s }).flow.step).toBe(s);
  });
  it('a new gender moves hairstyle to its default and keeps clothes only when they are on its list', () => {
    const ap = A({ g: 1, cl: 4 }); // chico: 4 is not on the chica list
    const toChica = withField(ap, 'g', 0);
    expect([toChica.g, toChica.s, CLOTHES_BY_GENDER[0]!.includes(toChica.cl)]).toEqual([0, 1, true]);
    expect(withField(A({ g: 1, cl: 2 }), 'g', 0).cl).toBe(2); // 2 is on both lists
  });
});

describe('Aleatorio', () => {
  it('applies the look the shell drew and sends it live', () => {
    const next = A({ hc: 0, bk: 5 });
    const r = reduce(open(), { t: 'random', ap: next });
    expect(r.flow.ap).toBe(next);
    expect(r.fx).toEqual([{ k: 'send', done: false }]);
  });
  it('the creator is always valid: any sequence of picks leaves a sanitized look', () => {
    let f = open();
    for (let i = 0; i < 300; i++) {
      const field = FIELDS[i % FIELDS.length]!;
      f = reduce(f, { t: 'pick', field, value: ((i * 7) % (FIELD_SIZE[field] + 2)) - 1 }).flow;
      expect(sanitizeAppearance(f.ap, 0)).toEqual(f.ap);
    }
  });
});

describe('edit and forced close', () => {
  it('Editar personaje reopens the creator and tells the screen the player is customizing again', () => {
    const closed = reduce(open(), { t: 'done' }).flow;
    const r = reduce(closed, { t: 'edit' });
    expect(r.flow.screen).toBe('creator');
    expect(r.fx).toContainEqual({ k: 'send', done: false });
    expect(reduce(r.flow, { t: 'edit' }).fx).toEqual([]); // already open
  });
  it('the host starting a match closes the creator and keeps the look as it stands', () => {
    const f = reduce(open(), { t: 'pick', field: 'gl', value: 1 }).flow;
    const r = reduce(f, { t: 'forceClose' });
    expect([r.flow.screen, r.flow.saved?.gl, r.fx]).toEqual(['closed', 1, [{ k: 'save' }]]);
    expect(reduce(r.flow, { t: 'forceClose' }).fx).toEqual([]);
  });
  it('events that do not belong to the current screen do nothing', () => {
    const closed = initialFlow(A());
    for (const e of [
      { t: 'pick', field: 'hat', value: 1 },
      { t: 'step', step: 'acc' },
      { t: 'next' },
      { t: 'done' },
      { t: 'play' },
      { t: 'random', ap: A() },
    ] as Event[])
      expect(reduce(closed, e)).toEqual({ flow: closed, fx: [] });
  });
});
