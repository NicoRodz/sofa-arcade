// Simple line icons (48x48 grid, stroked with currentColor) shared by the phones and the big screen.
// A game picks icons by id in the registry (games.ts); adding one here makes it available to every game.
export const ICONS = {
  move: '<path d="M24 6V42M6 24H42"/><path d="M17 13L24 6L31 13M17 35L24 42L31 35M13 17L6 24L13 31M35 17L42 24L35 31"/>',
  grab: '<path d="M15 27V13a3 3 0 0 1 6 0V23"/><path d="M21 22V9a3 3 0 0 1 6 0V22"/><path d="M27 22V12a3 3 0 0 1 6 0V27"/><path d="M33 27V19a3 3 0 0 1 6 0V30C39 38 33 43 26 43H24C18 43 15 40 12 35L7 27a3 3 0 0 1 5-3L15 28"/>',
  chop: '<g transform="rotate(-35 24 24)"><path d="M5 15H27a3 3 0 0 1 3 3V30a3 3 0 0 1-3 3H5Z"/><path d="M30 21H43" stroke-width="6"/><circle cx="11" cy="20" r="1.6"/></g><path d="M10 41H24"/>',
  crate: '<path d="M6 16L24 8L42 16V33L24 41L6 33Z"/><path d="M6 16L24 24L42 16M24 24V41"/>',
  oven: '<path d="M7 41V23a17 17 0 0 1 34 0V41Z"/><path d="M4 41H44"/><path d="M24 37C18 37 16 32 19 27C20 29 22 29 22 27C22 24 23 21 26 19C26 23 31 25 31 31C31 34 28 37 24 37Z"/>',
  bell: '<path d="M6 34a18 18 0 0 1 36 0Z"/><path d="M3 39H45"/><path d="M24 16V11M21 11H27"/>',
  star: '<path d="M24 5L29.5 17.5L43 19L33 28.5L36 42L24 35L12 42L15 28.5L5 19L18.5 17.5Z"/>',
} as const;

export type IconId = keyof typeof ICONS;
export const ICON_IDS = Object.keys(ICONS) as IconId[];
export const isIconId = (v: unknown): v is IconId => typeof v === 'string' && Object.hasOwn(ICONS, v);
