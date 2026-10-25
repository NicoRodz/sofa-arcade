import { describe, expect, it } from 'vitest';
import { INITIAL_FOCUS, pressFocus, stepItem, type FocusRow, type FocusState } from './focus-nav';

const row = (id: string, count: number, o: Partial<FocusRow> = {}): FocusRow => ({
  id,
  count,
  disabled: Array(count).fill(false),
  sel: 0,
  live: true,
  ...o,
});
const rows = [
  row('diffs', 3, { sel: 1 }),
  row('maps', 4, { live: false, sel: -1 }),
  row('howto', 1, { live: false }),
  row('start', 1, { live: false, start: true }),
];
const at = (r: string, cursor: Record<string, number> = {}): FocusState => ({ row: r, cursor });

describe('pressFocus', () => {
  it('starts on "Iniciar", so Enter keeps starting like before', () => {
    expect(pressFocus(INITIAL_FOCUS, rows, 'Enter')).toMatchObject({ handled: false });
    expect(pressFocus(INITIAL_FOCUS, rows, 'ArrowLeft').handled).toBe(false);
  });
  it('up/down change the row and stop at the ends', () => {
    expect(pressFocus(at('start'), rows, 'ArrowUp').state.row).toBe('howto');
    expect(pressFocus(at('diffs'), rows, 'ArrowUp')).toMatchObject({ handled: true, state: { row: 'diffs' } });
    expect(pressFocus(at('start'), rows, 'ArrowDown')).toMatchObject({ handled: true, state: { row: 'start' } });
    expect(pressFocus(at('diffs'), rows, 'ArrowDown').state.row).toBe('maps');
  });
  it('left/right on a live row picks the neighbour at once and stops at the ends', () => {
    expect(pressFocus(at('diffs'), rows, 'ArrowRight').activate).toEqual({ row: 'diffs', index: 2 });
    expect(pressFocus(at('diffs'), rows, 'ArrowLeft').activate).toEqual({ row: 'diffs', index: 0 });
    const edge = [row('diffs', 3, { sel: 2 }), rows[3]!];
    expect(pressFocus(at('diffs'), edge, 'ArrowRight')).toEqual({ handled: true, state: expect.anything() });
  });
  it('left/right on a grid row move the cursor without activating; Enter activates it', () => {
    const r1 = pressFocus(at('maps'), rows, 'ArrowRight');
    expect(r1).toMatchObject({ handled: true, state: { cursor: { maps: 1 } } });
    expect(r1.activate).toBeUndefined();
    expect(pressFocus(r1.state, rows, 'Enter').activate).toEqual({ row: 'maps', index: 1 });
  });
  it('skips disabled items and rows with nothing enabled', () => {
    const g = row('maps', 4, { live: false, disabled: [false, true, true, false] });
    expect(stepItem(g, 0, 1)).toBe(3);
    expect(pressFocus(at('maps'), [g, rows[3]!], 'ArrowRight').state.cursor).toEqual({ maps: 3 });
    const dead = row('muts', 2, { disabled: [true, true] });
    expect(pressFocus(at('start'), [dead, rows[3]!], 'ArrowUp').state.row).toBe('start');
    const off = row('maps', 2, { live: false, disabled: [true, false] });
    expect(pressFocus(at('maps'), [off, rows[3]!], 'Enter').activate).toBeUndefined();
  });
  it('Enter on a live row that is already picked does nothing; on a single button it clicks; Esc and other keys are not ours', () => {
    expect(pressFocus(at('diffs'), rows, 'Enter')).toEqual({ handled: true, state: expect.anything() });
    expect(pressFocus(at('howto'), rows, 'Enter').activate).toEqual({ row: 'howto', index: 0 });
    expect(pressFocus(at('howto'), rows, 'ArrowLeft').handled).toBe(false);
    expect(pressFocus(at('diffs'), rows, 'Escape').handled).toBe(false);
    expect(pressFocus(at('diffs'), rows, 'e').handled).toBe(false);
  });
  it('a held Enter never activates', () => {
    expect(pressFocus(at('howto'), rows, 'Enter', true)).toEqual({ handled: true, state: expect.anything() });
  });
  it('a focused row that vanished falls back to "Iniciar"; no rows at all hands the key on', () => {
    expect(pressFocus(at('gone'), rows, 'ArrowUp').state.row).toBe('howto');
    expect(pressFocus(at('diffs'), [], 'ArrowDown').handled).toBe(false);
  });
});

describe('grid rows: up/down walk the lines of the map grid before leaving it', () => {
  const grid: FocusRow = { id: 'maps', count: 17, disabled: Array(17).fill(false), sel: -1, live: false, cols: 7 };
  const top: FocusRow = { id: 'diffs', count: 3, disabled: [false, false, false], sel: 1, live: true };
  const bottom: FocusRow = { id: 'start', count: 1, disabled: [false], sel: -1, live: false, start: true };
  const rowsG = [top, grid, bottom];
  const on = (cursor: number) => ({ row: 'maps', cursor: { maps: cursor } });
  it('down moves a line in the same column, the short last line takes its last item, then the row changes', () => {
    expect(pressFocus(on(2), rowsG, 'ArrowDown').state.cursor.maps).toBe(9);
    expect(pressFocus(on(9), rowsG, 'ArrowDown').state.cursor.maps).toBe(16);
    expect(pressFocus(on(16), rowsG, 'ArrowDown').state.row).toBe('start');
  });
  it('up walks back and leaves the row from the first line', () => {
    expect(pressFocus(on(9), rowsG, 'ArrowUp').state.cursor.maps).toBe(2);
    expect(pressFocus(on(2), rowsG, 'ArrowUp').state.row).toBe('diffs');
  });
  it('skips a disabled item in the column', () => {
    const blocked = { ...grid, disabled: grid.disabled.map((_, i) => i === 9) };
    expect(pressFocus(on(2), [top, blocked, bottom], 'ArrowDown').state.cursor.maps).toBe(16);
  });
});
