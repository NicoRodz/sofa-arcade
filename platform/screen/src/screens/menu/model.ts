// What the start menu's card grid shows, as plain data: the template (view.ts) only draws it. Which cards exist and whether each can be picked
// is menu.ts (menuCards); this adds the selection (clamped to the cards that can be focused).
import { clampSel, type CardState, type MenuCard } from '../../menu';

export interface CardView {
  id: string;
  name: string;
  blurb: string;
  range: string; // '' hides the players pill
  state: CardState;
  notice: string;
  selected: boolean; // the highlighted card (never a "soon" one)
  pickable: boolean; // has data-game: the click and hover handlers look for it
}

export interface MenuView {
  cards: readonly CardView[];
  sel: number; // the clamped selection
}

export function menuView(cards: readonly MenuCard[], sel: number): MenuView {
  const at = clampSel(cards, sel);
  return {
    sel: at,
    cards: cards.map((c, i) => ({
      id: c.id,
      name: c.name,
      blurb: c.blurb,
      range: c.range,
      state: c.state,
      notice: c.notice,
      selected: i === at && c.state !== 'soon',
      pickable: c.state !== 'soon',
    })),
  };
}
