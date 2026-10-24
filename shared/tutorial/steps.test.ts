import { describe, expect, it } from 'vitest';
import {
  ALL_DONE_TEXT, DONE_TEXT, KNOWN_TEXT, SCHOOL_STEPS, SCHOOL_TOTAL, SCHOOL_SUB, SCHOOL_SUB_VERSUS, advance, allDone, completes, focusButton, fresh, instruction, isDone, regrantItem, skipped, wantedItems,
  type Prog, type SchoolEvent,
} from './steps';
import { SCHOOL_ROWS } from './schoolMap';
import { parseMap } from '../maps';

const words = (t: string) => t.trim().split(/\s+/).length;

describe('the four steps', () => {
  it('are exactly: take dough, chop tomato, bake, deliver', () => {
    expect(SCHOOL_STEPS.map((s) => s.id)).toEqual(['dough', 'tomato', 'oven', 'serve']);
    expect(SCHOOL_TOTAL).toBe(4);
  });
  it('every instruction the phone can show has at most 8 words, in Spanish', () => {
    for (const t of [...SCHOOL_STEPS.map((s) => s.text), DONE_TEXT, KNOWN_TEXT, ALL_DONE_TEXT]) expect(words(t), t).toBeLessThanOrEqual(8);
    expect(SCHOOL_STEPS[1]!.text).toContain('pícalo');
  });
  it('the TV subtitles say there is no clock and no points, and the versus one says the teams play together', () => {
    expect(SCHOOL_SUB).toMatch(/Sin tiempo ni puntos/);
    expect(SCHOOL_SUB_VERSUS).toMatch(/sin competir/);
  });
});

describe('which event finishes which step', () => {
  const picked = (item: SchoolEvent extends infer E ? E extends { kind: 'picked'; item: infer I } ? I : never : never, from = 'crate' as const): SchoolEvent => ({ kind: 'picked', item, from });
  it('step 0: dough taken from a crate, nothing else', () => {
    expect(completes(0, picked('raw0'))).toBe(true);
    expect(completes(0, picked('raw1'))).toBe(false);
    expect(completes(0, { kind: 'picked', item: 'raw0', from: 'counter' })).toBe(false);
    expect(completes(0, { kind: 'delivered' })).toBe(false);
  });
  it('step 1: a TOMATO chopped (not dough, not cheese)', () => {
    expect(completes(1, { kind: 'chopped', item: 'cut1' })).toBe(true);
    expect(completes(1, { kind: 'chopped', item: 'cut0' })).toBe(false);
    expect(completes(1, { kind: 'chopped', item: 'cut2' })).toBe(false);
    expect(completes(1, { kind: 'chopped', item: null })).toBe(false);
  });
  it('step 2: the chopped tomato put into an oven, not on a counter', () => {
    expect(completes(2, { kind: 'dropped', item: 'cut1', at: 'pot' })).toBe(true);
    expect(completes(2, { kind: 'dropped', item: 'cut1', at: 'counter' })).toBe(false);
    expect(completes(2, { kind: 'dropped', item: 'cut0', at: 'pot' })).toBe(false);
  });
  it('step 3: a delivery', () => {
    expect(completes(3, { kind: 'delivered' })).toBe(true);
    expect(completes(3, { kind: 'dropped', item: 'dish', at: 'pot' })).toBe(false);
  });
  it('a finished chef (step 4) is finished by nothing', () => {
    for (const ev of [{ kind: 'delivered' }, { kind: 'chopped', item: 'cut1' }, { kind: 'picked', item: 'raw0', from: 'crate' }] as SchoolEvent[]) expect(completes(4, ev)).toBe(false);
  });
});

describe('progress of one chef and of the table', () => {
  it('advances one step at a time and stops at the total', () => {
    let p: Prog = fresh();
    const seen = [p.step];
    for (let i = 0; i < 6; i++) { p = advance(p); seen.push(p.step); }
    expect(seen).toEqual([0, 1, 2, 3, 4, 4, 4]);
    expect(isDone(p)).toBe(true);
    expect(isDone(fresh())).toBe(false);
    expect(isDone(undefined)).toBe(false);
  });
  it('a skipped chef is done AND marked as skipped; advancing keeps the mark', () => {
    expect(isDone(skipped())).toBe(true);
    expect(skipped().skipped).toBe(true);
    expect(advance({ step: 1, skipped: true }).skipped).toBe(true);
  });
  it('the school ends only when somebody is connected and every connected chef is done', () => {
    const prog = new Map<number, Prog>([[1, skipped()], [2, { step: 3, skipped: false }]]);
    expect(allDone(prog, [])).toBe(false);
    expect(allDone(prog, [1])).toBe(true);
    expect(allDone(prog, [1, 2])).toBe(false);
    expect(allDone(prog, [1, 3])).toBe(false); // 3 has no progress yet
    prog.set(2, skipped());
    expect(allDone(prog, [1, 2])).toBe(true);
  });
});

describe('what a chef holds, and the button to light', () => {
  it('each step wants one item; a done chef may hold anything useful', () => {
    expect(wantedItems(0)).toEqual(['raw0']);
    expect(wantedItems(1)).toEqual(['raw1']);
    expect(wantedItems(2)).toEqual(['cut1']);
    expect(wantedItems(3)).toEqual(['dish']);
    expect(wantedItems(4)).toContain('plate');
  });
  it('only the steps after the chop hand the item back (a chopped tomato, a pizza)', () => {
    expect([0, 1, 2, 3, 4].map(regrantItem)).toEqual([null, null, 'cut1', 'dish', null]);
  });
  it('A is the button, except B while a raw tomato is under the knife and B for the dash once done', () => {
    expect(focusButton(0, { b: 'Correr', bIcon: 'move' })).toBe('a');
    expect(focusButton(1, { b: 'Picar', bIcon: 'chop' })).toBe('b');
    expect(focusButton(1, { b: 'Picar', bIcon: 'chop', bOff: true })).toBe('a');
    expect(focusButton(1, { b: 'Correr', bIcon: 'move' })).toBe('a');
    expect(focusButton(2, { b: 'Picar', bIcon: 'chop' })).toBe('a');
    expect(focusButton(4, {})).toBe('b');
  });
  it('the instruction follows the step; finished says what is left, and "todos listos" once the table is done', () => {
    expect(instruction(fresh(), false)).toEqual({ step: 0, text: SCHOOL_STEPS[0]!.text, done: false });
    expect(instruction({ step: 3, skipped: false }, false).text).toBe(SCHOOL_STEPS[3]!.text);
    expect(instruction({ step: 4, skipped: false }, false)).toEqual({ step: 4, text: DONE_TEXT, done: true });
    expect(instruction(skipped(), false).text).toBe(KNOWN_TEXT); // a chef that skipped did not play it
    expect(instruction({ step: 4, skipped: false }, true).text).toBe(ALL_DONE_TEXT);
    expect(instruction(undefined, false).step).toBe(0);
  });
});

describe('the school kitchen', () => {
  const grid = parseMap(SCHOOL_ROWS);
  const kinds = grid.flat().filter((t) => t.kind === 'station') as { station: string; crate: number }[];
  it('is a valid 16x9 map with eight spawn tiles and every station of the four steps, twice (a counter line on each wall)', () => {
    expect(grid.flat().filter((t) => t.kind === 'floor' && t.spawn)).toHaveLength(8);
    const count = (k: string, crate?: number) => kinds.filter((s) => s.station === k && (crate === undefined || s.crate === crate)).length;
    expect(count('crate', 0)).toBeGreaterThanOrEqual(2); // dough
    expect(count('crate', 1)).toBeGreaterThanOrEqual(2); // tomato
    expect(count('board')).toBeGreaterThanOrEqual(4);
    expect(count('pot')).toBeGreaterThanOrEqual(2);
    expect(count('window')).toBeGreaterThanOrEqual(2);
  });
  it('has no cheese, sink or plates: the school teaches the four steps and nothing else', () => {
    expect(kinds.filter((s) => ['sink', 'dirty', 'plates', 'trash', 'catapult'].includes(s.station))).toHaveLength(0);
    expect(kinds.filter((s) => s.station === 'crate' && s.crate === 2)).toHaveLength(0);
  });
});
