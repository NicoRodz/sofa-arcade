import type { PublicPlayer } from '@pichi/core';
import { describe, expect, it } from 'vitest';
import { CAPTAIN_NOTICE, chipView, diffPills, joinUrl, playersCount, WAITING } from './model';

const p = (over: Partial<PublicPlayer> = {}): PublicPlayer => ({
  id: 7,
  name: 'Nico',
  color: '#e63',
  slot: 0,
  connected: true,
  teamId: null,
  ...over,
});

describe('chipView', () => {
  it('an empty slot is the waiting card: only `empty`, the slot number, no sub text', () => {
    const v = chipView(3, undefined, null);
    expect(v).toMatchObject({ num: 4, name: WAITING, sub: { making: false, text: '' } });
    expect(v.classes).toEqual({ empty: true, gone: false, chef: false, helper: false, making: false });
  });
  it('a seated player: name, the chef of the slot and "listo"; no look of its own wears the neutral `chef` face', () => {
    const v = chipView(0, p(), null);
    expect(v.name).toBe('Nico');
    expect(v.sub).toEqual({ making: false, text: expect.stringMatching(/ · listo$/) });
    expect(v.classes).toEqual({ empty: false, gone: false, chef: true, helper: false, making: false });
  });
  it('the Captain wears the crown, only the Captain', () => {
    expect(chipView(0, p({ id: 7 }), 7).name).toBe('👑 Nico');
    expect(chipView(0, p({ id: 7 }), 8).name).toBe('Nico');
    expect(chipView(0, p({ id: 7 }), null).name).toBe('Nico');
  });
  it('Ayudante: the sub says so and `helper` is on', () => {
    const v = chipView(0, p({ assist: true }), null);
    expect(v.sub.text).toMatch(/ · Ayudante$/);
    expect(v.classes.helper).toBe(true);
  });
  it('making the character: the pen sub and `making`; a disconnected player is `gone` and says so, never `making`', () => {
    expect(chipView(0, p({ customizing: true }), null)).toMatchObject({ sub: { making: true, text: '' }, classes: { making: true } });
    const gone = chipView(0, p({ customizing: true, connected: false }), null);
    expect(gone.sub).toEqual({ making: false, text: 'Desconectado' });
    expect(gone.classes).toMatchObject({ gone: true, making: false });
  });
  it('is a pure function of its inputs: fresh data in, fresh view out (a player leaves, the slot is the waiting card again)', () => {
    const a = chipView(1, p({ slot: 1, name: 'A' }), null);
    const b = chipView(1, undefined, null);
    const c = chipView(1, p({ slot: 1, name: 'B' }), null);
    expect([a.name, b.name, c.name]).toEqual(['A', WAITING, 'B']);
  });
});

describe('lobby pills and join card data', () => {
  it('diffPills: one pill per difficulty, exactly the current one selected', () => {
    const pills = diffPills('hard');
    expect(pills.map((x) => x.id)).toEqual(['easy', 'normal', 'hard']);
    expect(pills.filter((x) => x.selected).map((x) => x.id)).toEqual(['hard']);
    expect(pills.map((x) => x.label)).toEqual(['Fácil', 'Normal', 'Difícil']);
  });
  it('the url drops http://, the count is connected/8, the Captain notice is the phone prompt', () => {
    expect(joinUrl('http://192.168.1.5:5050/c?room=AB')).toBe('192.168.1.5:5050/c?room=AB');
    expect(joinUrl('https://x.cl/c')).toBe('https://x.cl/c');
    expect(playersCount(3)).toBe('3/8');
    expect(CAPTAIN_NOTICE).toBe('Capitán: elige desde tu teléfono');
  });
});
