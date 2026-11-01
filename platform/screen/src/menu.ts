// Pichiclub start menu: which cards the registry produces, which of them can be picked with the players connected right now,
// and what a key or a click does. Free of the DOM so it can be tested.
import { playersLabel, type ComingSoon, type GameDef } from '@pichi/core/contract';
import type { SfxId } from './audio/recipes';
import { soonEnabled } from './dev-flags';
import { catalog } from './shell/catalog';

export const GRID_COLS = 3;

// ready: can be picked. few / many: the game exists but the players connected are outside its range. soon: announced only.
export type CardState = 'ready' | 'few' | 'many' | 'soon';
export interface MenuCard {
  id: string;
  name: string;
  blurb: string;
  range: string;
  state: CardState;
  notice: string;
}

const plural = (n: number) => `${n} ${n === 1 ? 'jugador' : 'jugadores'}`;

export function availability(
  g: Pick<GameDef, 'minPlayers' | 'maxPlayers'>,
  connected: number,
): { state: 'ready' | 'few' | 'many'; notice: string } {
  if (connected < g.minPlayers) return { state: 'few', notice: `Hay ${plural(connected)}: necesita al menos ${g.minPlayers}` };
  if (connected > g.maxPlayers) return { state: 'many', notice: `Hay ${plural(connected)}: admite hasta ${g.maxPlayers}` };
  return { state: 'ready', notice: '' };
}

// Registry games first (in registry order), then the announced ones that are not in the registry yet. With `?soon=1` (dev-flags.ts) the announced ones are
// pickable cards too (their player range is unknown, so they never wait for players); without it they are a "Próximamente" card that does nothing.
export function menuCards(
  connected: number,
  games: readonly GameDef[] = catalog().games,
  soon: readonly ComingSoon[] = catalog().comingSoon,
  showSoon: boolean = soonEnabled(),
): MenuCard[] {
  const live: MenuCard[] = games.map((g) => ({
    id: g.id,
    name: g.name,
    blurb: g.blurb,
    range: playersLabel(g),
    ...availability(g, connected),
  }));
  const have = new Set(games.map((g) => g.id));
  const next: MenuCard[] = soon
    .filter((s) => !have.has(s.id))
    .map(
      (s): MenuCard => ({
        id: s.id,
        name: s.name,
        blurb: s.blurb,
        range: '',
        ...(showSoon ? { state: 'ready', notice: 'En desarrollo' } : { state: 'soon', notice: 'Próximamente' }),
      }),
    );
  return [...live, ...next];
}

// Selection moves over the cards that exist (the "soon" ones come last and are never focused). A disabled card can be focused to read why.
export const selectableCount = (cards: readonly MenuCard[]) => cards.filter((c) => c.state !== 'soon').length;
export const clampSel = (cards: readonly MenuCard[], sel: number) => Math.max(0, Math.min(selectableCount(cards) - 1, sel));

export type MenuAction =
  | { kind: 'move'; sel: number }
  | { kind: 'pick'; id: string }
  | { kind: 'refuse'; notice: string } // Enter / click on a card that cannot be played right now
  | { kind: 'none' };
const NONE: MenuAction = { kind: 'none' };

const STEP: Record<string, (cols: number) => number> = {
  ArrowRight: () => 1,
  ArrowLeft: () => -1,
  ArrowDown: (c) => c,
  ArrowUp: (c) => -c,
};

export function menuPick(cards: readonly MenuCard[], id: string): MenuAction {
  const c = cards.find((x) => x.id === id);
  if (!c || c.state === 'soon') return NONE;
  return c.state === 'ready' ? { kind: 'pick', id: c.id } : { kind: 'refuse', notice: c.notice };
}

export function menuOnKey(cards: readonly MenuCard[], sel: number, key: string, cols = GRID_COLS): MenuAction {
  const cur = clampSel(cards, sel);
  const step = STEP[key];
  if (step) {
    const to = cur + step(cols);
    return to === cur || to < 0 || to >= selectableCount(cards) ? NONE : { kind: 'move', sel: to };
  }
  if (key === 'Enter' || key === ' ') {
    const c = cards[cur];
    return c ? menuPick(cards, c.id) : NONE;
  }
  return NONE;
}

// Navigation sounds reuse the synthesised UI voices (recipes.ts); a refused pick is the same buzz as an invalid action in game.
export const NAV_SFX = { move: 'navMove', pick: 'navPick', back: 'navBack', refuse: 'buzz' } as const satisfies Record<string, SfxId>;
export type NavSound = keyof typeof NAV_SFX;
export const soundFor = (a: MenuAction): NavSound | null =>
  a.kind === 'move' ? 'move' : a.kind === 'pick' ? 'pick' : a.kind === 'refuse' ? 'refuse' : null;

// Esc in a game's lobby goes back to the menu, unless a card (how to play) is open or a round is starting: those own Esc.
export const lobbyEscGoesBack = (phase: string, key: string, howToOpen: boolean, starting: boolean) =>
  phase === 'lobby' && key === 'Escape' && !howToOpen && !starting;
