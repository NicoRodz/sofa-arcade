// The Captain's touch menu on the phone, as a pure state machine: what the screen's last snapshot said, which of the three views is up (list, maps,
// confirmation), the notice and the "Mando" switch. The phone holds no game state: every value shown is the snapshot's, and every touch is an absolute
// value for the screen to judge. Nothing here knows a game.
import type { MenuActBody, MenuErrBody, MenuItem, MenuRow, MenuSnapshot } from '@pichi/core';

export type MenuView = 'main' | 'maps' | 'confirm';
export const CONFIRM_DELAY_MS = 500; // "Sí, ¡a cocinar!" wakes up this long after the card opens: a double tap on the start button cannot start by accident
export const NOTICE_MS = 3000;

export interface MenuUi {
  snap: MenuSnapshot | null;
  view: MenuView;
  tab: string | null; // the map group open in the maps view (null: the one holding the picked map)
  notice: string;
  noticeUntil: number;
  confirmAt: number; // when the confirmation opened
  pad: boolean; // the Captain asked for the D-pad ("Mando"): the form steps aside
}
export const initialUi = (): MenuUi => ({ snap: null, view: 'main', tab: null, notice: '', noticeUntil: 0, confirmAt: 0, pad: false });

const say = (ui: MenuUi, msg: string, now: number): MenuUi => ({ ...ui, notice: msg, noticeUntil: now + NOTICE_MS });
export const noticeOf = (ui: MenuUi, now: number): string => (now < ui.noticeUntil ? ui.notice : '');

/** The Captain loses the crown or the lobby closes: the form is gone, and the next one starts at the list. */
export const closeMenu = (ui: MenuUi): MenuUi => ({ ...initialUi(), pad: ui.pad });

export function onSnapshot(ui: MenuUi, snap: MenuSnapshot, now: number): MenuUi {
  if (ui.snap && snap.rev < ui.snap.rev) return ui; // an older one that arrived late
  let next: MenuUi = { ...ui, snap };
  const grid = gridRow(snap);
  if (next.view === 'maps' && !grid) next = { ...next, view: 'main' };
  if (next.tab && !grid?.groups?.some((g) => g.id === next.tab)) next = { ...next, tab: null };
  if (next.view === 'confirm' && !snap.primary.enabled)
    next = say({ ...next, view: 'main' }, snap.primary.reason ?? 'Ya no se puede empezar', now);
  return next;
}

/** The screen refused the last touch. A stale or disabled start closes the confirmation; the list is already the new snapshot. */
export function onErr(ui: MenuUi, err: MenuErrBody, now: number): MenuUi {
  return say(err.code === 'notCaptain' ? closeMenu(ui) : { ...ui, view: ui.view === 'confirm' ? 'main' : ui.view }, err.msg, now);
}

export const gridRow = (snap: MenuSnapshot | null): MenuRow | undefined => snap?.rows.find((r) => r.kind === 'grid');

/** The map group shown in the maps view: the open tab, else the one that holds the picked map, else the first. */
export function currentTab(ui: MenuUi): string | null {
  const g = gridRow(ui.snap);
  if (!g?.groups?.length) return null;
  if (ui.tab && g.groups.some((x) => x.id === ui.tab)) return ui.tab;
  return (g.groups.find((x) => x.items.some((i) => i.id === g.value)) ?? g.groups[0]!).id;
}

/** The picked option of a row as the phone names it (the grid's picked map, or one of its extras). */
export function pickedOf(row: MenuRow): { label: string; players?: string; stars?: number } | null {
  const item: Partial<MenuItem> | undefined =
    row.groups?.flatMap((g) => g.items).find((i) => i.id === row.value) ?? row.options?.find((o) => o.id === row.value);
  return item?.label
    ? { label: item.label, ...(item.players ? { players: item.players } : {}), ...(item.stars ? { stars: item.stars } : {}) }
    : null;
}

export const openMaps = (ui: MenuUi): MenuUi => (gridRow(ui.snap) ? { ...ui, view: 'maps' } : ui);
export const goBack = (ui: MenuUi): MenuUi => ({ ...ui, view: 'main' });
export const setTab = (ui: MenuUi, tab: string): MenuUi => ({ ...ui, tab });
export const setPad = (ui: MenuUi, pad: boolean): MenuUi => ({ ...ui, pad });

/** Tap on ¡A cocinar!: the confirmation opens only when the screen says the round can start; otherwise the reason is the notice (as the design asks). */
export function ask(ui: MenuUi, now: number): MenuUi {
  const p = ui.snap?.primary;
  if (!p) return ui;
  return p.enabled ? { ...ui, view: 'confirm', confirmAt: now } : say(ui, p.reason ?? 'Todavía no se puede empezar', now);
}
export const confirmReady = (ui: MenuUi, now: number): boolean => ui.view === 'confirm' && now - ui.confirmAt >= CONFIRM_DELAY_MS;

/** A tap on something the screen disabled: its reason as the notice, no message sent. */
export const refuse = (ui: MenuUi, reason: string | undefined, now: number): MenuUi => say(ui, reason ?? 'No disponible ahora', now);

/** The message for a touch, with the revision of the snapshot the finger saw. null: there is nothing to answer to. */
export function actMsg(ui: MenuUi, act: MenuActBody['act'], row?: string, value?: string | boolean): MenuActBody | null {
  if (!ui.snap) return null;
  return { rev: ui.snap.rev, act, ...(row !== undefined ? { row } : {}), ...(value !== undefined ? { value } : {}) };
}

/** Is the form the thing on the phone right now? (Captain, joined, lobby, a snapshot in hand, no "Mando".) */
export const formUp = (ui: MenuUi, isCaptain: boolean, phase: string): boolean => isCaptain && phase === 'lobby' && !!ui.snap && !ui.pad;
/** Is the "back to the form" button on screen? (the D-pad is up in place of the form) */
export const padUp = (ui: MenuUi, isCaptain: boolean, phase: string): boolean => isCaptain && phase === 'lobby' && !!ui.snap && ui.pad;
