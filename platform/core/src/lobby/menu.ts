// The Captain's touch menu (docs: plans/menu-tactil-capitan-diseno.md). The screen describes its lobby as a declarative snapshot (`menu`), the Captain's phone
// draws it and answers with ABSOLUTE values ("difficulty = hard"), never "arrow right"; the screen stays the owner of the state. Everything here is pure and
// game-agnostic: rows are opaque ids and labels, and the phone never branches on a game.
//
// Additive over protocol v6: a phone announces `caps: ['menu1']` when it joins; an older phone ignores `menu` and keeps using `nav`.

export const MENU_CAP = 'menu1';
export const MENU_ACTS = ['set', 'press', 'focus', 'start'] as const;
export type MenuAct = (typeof MENU_ACTS)[number];
export const MENU_ERR_CODES = ['stale', 'disabled', 'notCaptain'] as const;
export type MenuErrCode = (typeof MENU_ERR_CODES)[number];
export const MENU_ROW_KINDS = ['choice', 'toggle', 'buttons', 'grid'] as const;
export type MenuRowKind = (typeof MENU_ROW_KINDS)[number];

// Limits the relay enforces on raw frames, and the ones the parser enforces on content.
export const MENU_ACT_MAX_BYTES = 512;
export const MENU_MAX_BYTES = 32 * 1024;
export const MENU_ACT_PER_SEC = 10;
const MAX_ROWS = 16,
  MAX_OPTIONS = 12,
  MAX_GROUPS = 6,
  MAX_ITEMS = 40,
  MAX_SUMMARY = 6;

export interface MenuOption {
  id: string;
  label: string;
  enabled: boolean;
  reason?: string; // why it is off (shown under the option, and as the notice when it is tapped)
}
export interface MenuItem extends MenuOption {
  players?: string; // "2-4"
  stars?: number; // 0..3
}
export interface MenuGroup {
  id: string;
  label: string;
  items: MenuItem[];
}
export interface MenuRow {
  id: string;
  label: string;
  kind: MenuRowKind;
  value: string | boolean | null; // the picked option id (choice, grid) or the switch (toggle); buttons have none
  hint?: string; // one line under the row
  options?: MenuOption[]; // choice / toggle labels are drawn by the phone; buttons / grid extras
  groups?: MenuGroup[]; // grid only: tabs of cards
}
export interface MenuPrimary {
  id: 'start';
  label: string;
  enabled: boolean;
  reason?: string;
  summary: string[]; // the lines of the confirmation card
}
export interface MenuBody {
  screen: string; // which lobby page this describes (informational)
  rows: MenuRow[];
  primary: MenuPrimary;
}
export type MenuSnapshot = MenuBody & { rev: number };

export interface MenuActBody {
  rev: number;
  act: MenuAct;
  row?: string;
  value?: string | boolean;
}
export interface MenuErrBody {
  rev: number;
  code: MenuErrCode;
  msg: string;
}

const ID = /^[A-Za-z0-9_-]{1,32}$/;
export const isMenuId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const optStr = (v: unknown, max: number): boolean => v === undefined || str(v, max);
const isRev = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 2 ** 31;

/** Phone -> relay. `row` / `value` only as ids or a switch: free text never travels. null = malformed (the message is dropped). */
export function parseMenuAct(m: any): MenuActBody | null {
  if (!isRev(m.rev) || !(MENU_ACTS as readonly unknown[]).includes(m.act)) return null;
  if (m.row !== undefined && !isMenuId(m.row)) return null;
  if (m.value !== undefined && !(typeof m.value === 'boolean' || isMenuId(m.value))) return null;
  return {
    rev: m.rev,
    act: m.act,
    ...(m.row !== undefined ? { row: m.row } : {}),
    ...(m.value !== undefined ? { value: m.value } : {}),
  };
}

export function parseMenuErr(m: any): MenuErrBody | null {
  if (!isRev(m.rev) || !(MENU_ERR_CODES as readonly unknown[]).includes(m.code) || !str(m.msg, 120)) return null;
  return { rev: m.rev, code: m.code, msg: m.msg };
}

function parseOption(o: any): MenuOption | null {
  if (!o || typeof o !== 'object' || !isMenuId(o.id) || !str(o.label, 40) || typeof o.enabled !== 'boolean' || !optStr(o.reason, 80))
    return null;
  return { id: o.id, label: o.label, enabled: o.enabled, ...(o.reason !== undefined ? { reason: o.reason } : {}) };
}
function parseItem(o: any): MenuItem | null {
  const base = parseOption(o);
  if (!base || !optStr(o.players, 12) || !(o.stars === undefined || (Number.isInteger(o.stars) && o.stars >= 0 && o.stars <= 3)))
    return null;
  return { ...base, ...(o.players !== undefined ? { players: o.players } : {}), ...(o.stars !== undefined ? { stars: o.stars } : {}) };
}
function list<T>(v: unknown, max: number, one: (x: any) => T | null): T[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  const out: T[] = [];
  for (const x of v) {
    const p = one(x);
    if (!p) return null;
    out.push(p);
  }
  return out;
}
function parseGroup(g: any): MenuGroup | null {
  if (!g || typeof g !== 'object' || !isMenuId(g.id) || !str(g.label, 40)) return null;
  const items = list(g.items, MAX_ITEMS, parseItem);
  return items ? { id: g.id, label: g.label, items } : null;
}
function parseRow(r: any): MenuRow | null {
  if (!r || typeof r !== 'object' || !isMenuId(r.id) || !str(r.label, 40) || !(MENU_ROW_KINDS as readonly unknown[]).includes(r.kind))
    return null;
  if (!(r.value === null || typeof r.value === 'boolean' || isMenuId(r.value)) || !optStr(r.hint, 120)) return null;
  const options = r.options === undefined ? undefined : list(r.options, MAX_OPTIONS, parseOption);
  const groups = r.groups === undefined ? undefined : list(r.groups, MAX_GROUPS, parseGroup);
  if (options === null || groups === null) return null;
  return {
    id: r.id,
    label: r.label,
    kind: r.kind,
    value: r.value,
    ...(r.hint !== undefined ? { hint: r.hint } : {}),
    ...(options ? { options } : {}),
    ...(groups ? { groups } : {}),
  };
}

/** Screen -> relay -> Captain. Everything is checked and rebuilt: the phone only ever draws what passed here. */
export function parseMenuSnapshot(m: any): MenuSnapshot | null {
  const p = m.primary;
  if (!isRev(m.rev) || !str(m.screen, 32) || !p || typeof p !== 'object' || p.id !== 'start') return null;
  const rows = list(m.rows, MAX_ROWS, parseRow);
  if (!rows || !str(p.label, 40) || typeof p.enabled !== 'boolean' || !optStr(p.reason, 120)) return null;
  const summary = list(p.summary, MAX_SUMMARY, (s) => (str(s, 80) ? s : null));
  if (!summary) return null;
  return {
    rev: m.rev,
    screen: m.screen,
    rows,
    primary: { id: 'start', label: p.label, enabled: p.enabled, ...(p.reason !== undefined ? { reason: p.reason } : {}), summary },
  };
}

/** `caps` of a join: a short list of known tokens, anything else is ignored (a phone may announce more than this relay knows). */
export const parseCaps = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string' && ID.test(c)).slice(0, 8) : [];
