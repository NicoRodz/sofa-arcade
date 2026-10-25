// The DOM side of the lobby focus: reads the rows of LOBBY_ROWS from the page, feeds a key to pressFocus, clicks what it says to activate
// (so every existing click handler and its guards keep deciding) and paints the focus ring. The page is behind FocusEnv so tests use fakes.
import './focus-nav.css';
import { INITIAL_FOCUS, cursorOf, navigable, pressFocus, type FocusRow, type FocusState } from './focus-nav';
import { LOBBY_ROWS, type RowSpec } from './focus-rows';

export interface FocusEl {
  classList: { contains(c: string): boolean; toggle(c: string, force?: boolean): unknown };
  click(): void;
}
export interface FocusEnv {
  hidden(id: string): boolean; // missing, hidden by `.off` / display:none up the tree, or the campaign screen is up
  items(spec: RowSpec): FocusEl[];
  root(spec: RowSpec): FocusEl | null;
}

const isOff = (el: FocusEl) => el.classList.contains('dis') || el.classList.contains('blk');

export const domEnv: FocusEnv = {
  hidden(id) {
    const el = document.getElementById(id);
    if (!el || document.getElementById('lobbyui')?.classList.contains('camp')) return true;
    for (let e: HTMLElement | null = el; e; e = e.parentElement) if (e.classList.contains('off') || e.style.display === 'none') return true;
    return false;
  },
  root: (s) => document.getElementById(s.root),
  items(s) {
    const root = document.getElementById(s.root);
    return !root ? [] : s.items === ':scope' ? [root] : [...root.querySelectorAll<HTMLElement>(s.items)];
  },
};

let focus: FocusState = INITIAL_FOCUS;
export const resetFocus = () => (focus = INITIAL_FOCUS);
export const currentFocus = () => focus;

function readRows(env: FocusEnv): { rows: FocusRow[]; els: Map<string, FocusEl[]> } {
  const els = new Map<string, FocusEl[]>();
  const rows: FocusRow[] = [];
  for (const s of LOBBY_ROWS) {
    if (env.hidden(s.root)) continue;
    const items = env.items(s);
    els.set(s.id, items);
    const disabled = items.map(isOff);
    rows.push({
      id: s.id,
      count: items.length,
      disabled,
      sel: items.findIndex((e) => e.classList.contains('sel')),
      live: s.live,
      start: s.start,
    });
  }
  return { rows, els };
}

// A key in the lobby. true: the focus took it (and maybe clicked an item); false: the legacy lobby keys / Enter-starts / Esc-goes-back go on.
export function lobbyFocusKey(key: string, repeat: boolean, env: FocusEnv = domEnv): boolean {
  const { rows, els } = readRows(env);
  const r = pressFocus(focus, rows, key, repeat);
  focus = r.state;
  if (r.activate) els.get(r.activate.row)?.[r.activate.index]?.click();
  paintFocus(env);
  return r.handled;
}

// The ring: the cursor item of the focused row gets .kfocus, its box .kfocus-row (the Captain sees on the TV which row is up).
export function paintFocus(env: FocusEnv = domEnv) {
  const { rows, els } = readRows(env);
  const live = navigable(rows);
  const cur = live.find((r) => r.id === focus.row) ?? live.find((r) => r.start);
  for (const s of LOBBY_ROWS) {
    const items = els.get(s.id) ?? [];
    const on = cur?.id === s.id;
    const row = rows.find((x) => x.id === s.id);
    const at = on && row ? cursorOf(focus, row) : -1;
    items.forEach((e, i) => e.classList.toggle('kfocus', i === at));
    const root = env.root(s);
    if (root && !(items.length === 1 && items[0] === root)) root.classList.toggle('kfocus-row', on);
  }
}
