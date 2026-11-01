// The art of tanda 2 of the Carta larga, drawn by code: the sauce (a bright red blob in a small bowl), the Marinara de la nonna (sauce pizza with basil), and the
// Pizza blanca (no tomato: a golden base with cheese and mushroom). The base pizza and tray are handed in (`BaseArt`) like in recipes.ts.
import { contactShadow, drawOutlined, vgrad, type Ctx } from '@pichi/screen-kit/art';
import { basilOverlay } from './basil';
import { toppingOverlay } from './toppings';

export type SauceFoodKind = 'sauce_blob' | 'pizza_done_nb' | 'dish_n' | 'dish_nb' | 'pizza_raw_w' | 'pizza_done_w' | 'dish_b';
interface Base {
  pizzaRaw(c: Ctx, shadow?: boolean, cheese?: boolean): void;
  pizzaDone(c: Ctx, shadow?: boolean, cheese?: boolean): void;
  tray(c: Ctx): void;
}
export const SAUCE_RED = '#E2321F';

/** A small bowl of bright red sauce with a glossy highlight. */
export function sauceBlob(c: Ctx) {
  contactShadow(c, 0, 22, 24, 5);
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(-22, 2);
      c.bezierCurveTo(-20, 22, 20, 22, 22, 2);
      c.closePath();
    },
    vgrad(c, 2, 22, '#C9C9CF', '#8E8E98'),
    { lw: 2.5 },
  );
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.ellipse(0, 2, 22, 9, 0, 0, Math.PI * 2);
    },
    vgrad(c, -7, 11, '#FF6A4D', SAUCE_RED),
    { lw: 2.5 },
  );
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.beginPath();
  c.ellipse(-8, -0.5, 6, 2.2, -0.2, 0, Math.PI * 2);
  c.fill();
}

// The white base: cream wash over the golden crust, so the red of the sauce is gone.
const whiteWash = (c: Ctx) => {
  c.fillStyle = 'rgba(255,240,200,0.8)';
  c.beginPath();
  c.arc(0, 0, 19, 0, Math.PI * 2);
  c.fill();
};

export function sauceDraw(base: Base): Record<SauceFoodKind, (c: Ctx) => void> {
  const plated = (c: Ctx, body: () => void) => {
    base.tray(c);
    c.save();
    c.scale(0.82, 0.82);
    body();
    c.restore();
  };
  return {
    sauce_blob: sauceBlob,
    pizza_done_nb: (c) => {
      base.pizzaDone(c, true, false);
      basilOverlay(c);
    },
    dish_n: (c) => plated(c, () => base.pizzaDone(c, false, false)),
    dish_nb: (c) =>
      plated(c, () => {
        base.pizzaDone(c, false, false);
        basilOverlay(c);
      }),
    pizza_raw_w: (c) => {
      base.pizzaRaw(c, true, true);
      whiteWash(c);
      toppingOverlay(c, 4, 0.95);
    },
    pizza_done_w: (c) => {
      base.pizzaDone(c, true, true);
      whiteWash(c);
      toppingOverlay(c, 4);
    },
    dish_b: (c) =>
      plated(c, () => {
        base.pizzaDone(c, false, true);
        whiteWash(c);
        toppingOverlay(c, 4);
      }),
  };
}
export const SAUCE_ITEM_KIND = { sauce: 'sauce_blob', dishN: 'dish_n', dishNB: 'dish_nb', dishB: 'dish_b' } as const;
