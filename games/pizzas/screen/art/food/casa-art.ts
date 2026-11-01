// The art of the Pizza de la casa (tanda 3): a cheese pizza on the red base, plus what the chef added. Ham in the oven (a pepperoni-pink square layer), basil on the plate after it,
// and radial cuts for the portions. One picture per upgrade mask (dish_h0 .. dish_h7); the oven shows the pizza with or without the ham.
import type { Ctx } from '@pichi/screen-kit/art';
import { basilOverlay } from './basil';
import { hamOverlay } from './ham';

const MASKS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
export type CasaFoodKind = `dish_h${(typeof MASKS)[number]}` | 'pizza_raw_h1' | 'pizza_done_h1';
export const CASA_ITEM_KIND = Object.fromEntries(MASKS.map((m) => [`dishH${m}`, `dish_h${m}`])) as Record<
  `dishH${(typeof MASKS)[number]}`,
  CasaFoodKind
>;
interface Base {
  pizzaRaw(c: Ctx, shadow?: boolean, cheese?: boolean): void;
  pizzaDone(c: Ctx, shadow?: boolean, cheese?: boolean): void;
  tray(c: Ctx): void;
}

// Eight radial cuts across the pizza (the portions).
const cuts = (c: Ctx) => {
  c.strokeStyle = 'rgba(60,30,10,0.75)';
  c.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    c.beginPath();
    c.moveTo(Math.cos(a) * -24, Math.sin(a) * -24);
    c.lineTo(Math.cos(a) * 24, Math.sin(a) * 24);
    c.stroke();
  }
};
export function casaDraw(base: Base): Record<CasaFoodKind, (c: Ctx) => void> {
  const plate = (mask: number) => (c: Ctx) => {
    base.tray(c);
    c.save();
    c.scale(0.82, 0.82);
    base.pizzaDone(c, false, true);
    if (mask & 1) hamOverlay(c);
    if (mask & 2) basilOverlay(c);
    if (mask & 4) cuts(c);
    c.restore();
  };
  return {
    ...(Object.fromEntries(MASKS.map((m) => [`dish_h${m}`, plate(m)])) as Record<`dish_h${(typeof MASKS)[number]}`, (c: Ctx) => void>),
    pizza_raw_h1: (c) => {
      base.pizzaRaw(c, true, true);
      hamOverlay(c, 0.95);
    },
    pizza_done_h1: (c) => {
      base.pizzaDone(c, true, true);
      hamOverlay(c);
    },
  };
}
