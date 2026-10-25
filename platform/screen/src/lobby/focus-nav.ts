// Focus navigation for the lobby, pure: rows of options, one focused row, up/down changes row, left/right changes the value of a "live" row
// (Difficulty, Mode...) or moves the cursor inside a "grid" row (maps, levels, team buttons), Enter activates the cursor, Esc is not ours.
// The Captain's D-pad sends the same keys as the Mac keyboard, so both use this one function. The DOM side lives in focus-nav-dom.ts.

// What the DOM says about a row right now. `sel` is the picked item of a live row (-1: none); `start` marks the "Iniciar" row.
export interface FocusRow {
  id: string;
  count: number;
  disabled: readonly boolean[];
  sel: number;
  live: boolean;
  start?: boolean;
  cols?: number; // a grid row laid out in this many columns: up/down walk its lines before they leave the row
}
export interface FocusState {
  row: string;
  cursor: Readonly<Record<string, number>>;
}
export interface FocusResult {
  state: FocusState;
  handled: boolean; // false: the key keeps going to the legacy handlers (Enter on "Iniciar" starts, Esc goes back, versus arrows step the sabotage)
  activate?: { row: string; index: number };
}

export const INITIAL_FOCUS: FocusState = { row: 'start', cursor: {} };

const usable = (r: FocusRow) => r.count > 0 && r.disabled.some((d, i) => i < r.count && !d);
export const navigable = (rows: readonly FocusRow[]): FocusRow[] => rows.filter((r) => usable(r) || r.start);

// Where the cursor is in a row: the stored one for grids, the picked item for live rows; clamped to the row.
export function cursorOf(state: FocusState, r: FocusRow): number {
  const c = r.live ? Math.max(0, r.sel) : (state.cursor[r.id] ?? Math.max(0, r.sel));
  return Math.max(0, Math.min(r.count - 1, c));
}

// The nearest enabled item from `from` in direction `dir` (no wrap), or -1.
export function stepItem(r: FocusRow, from: number, dir: 1 | -1): number {
  for (let i = from + dir; i >= 0 && i < r.count; i += dir) if (!r.disabled[i]) return i;
  return -1;
}

// The item one line up/down in a grid row (same column; the short last line takes its last item), or -1 when the cursor is already on the first/last line.
export function stepLine(r: FocusRow, from: number, dir: 1 | -1): number {
  const cols = r.cols ?? r.count;
  for (let i = from + dir * cols; i >= 0 && i < r.count; i += dir * cols) if (!r.disabled[i]) return i;
  const last = r.count - 1;
  if (dir === 1 && Math.floor(from / cols) < Math.floor(last / cols) && !r.disabled[last]) return last;
  return -1;
}

export function pressFocus(state: FocusState, rows: readonly FocusRow[], key: string, repeat = false): FocusResult {
  const nav = navigable(rows);
  const miss: FocusResult = { state, handled: false };
  if (nav.length === 0) return miss;
  let at = nav.findIndex((r) => r.id === state.row);
  if (at < 0) at = nav.findIndex((r) => r.start) >= 0 ? nav.findIndex((r) => r.start) : nav.length - 1;
  const row = nav[at]!;
  const here: FocusState = { ...state, row: row.id };
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const inGrid = row.cols ? stepLine(row, cursorOf(here, row), key === 'ArrowUp' ? -1 : 1) : -1;
    if (inGrid >= 0) return { state: { ...here, cursor: { ...here.cursor, [row.id]: inGrid } }, handled: true };
    const next = nav[Math.max(0, Math.min(nav.length - 1, at + (key === 'ArrowUp' ? -1 : 1)))]!;
    return { state: { ...here, row: next.id }, handled: true };
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    if (row.start || (row.count <= 1 && !row.live)) return { state: here, handled: false };
    const from = cursorOf(here, row);
    const to = stepItem(row, from, key === 'ArrowLeft' ? -1 : 1);
    if (to < 0) return { state: here, handled: true };
    const moved = { ...here, cursor: { ...here.cursor, [row.id]: to } };
    return row.live ? { state: moved, handled: true, activate: { row: row.id, index: to } } : { state: moved, handled: true };
  }
  if (key === 'Enter') {
    if (row.start) return { state: here, handled: false };
    const i = cursorOf(here, row);
    if (repeat || row.disabled[i] || (row.live && i === row.sel)) return { state: here, handled: true };
    return { state: here, handled: true, activate: { row: row.id, index: i } };
  }
  return miss;
}
