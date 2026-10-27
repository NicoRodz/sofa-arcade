// The ticket of a Bandeja familiar (hud.ts builds the ticket around it): its three plates in a row, each dimmed with a tick once it is on the window, and under them what the
// tray pays: "x1.3" while the margin of the first plate lasts, "sin bono" after it. Also the pink balloon of the birthday ticket (moved here to keep hud.ts from growing).
import type Phaser from 'phaser';
import { RECIPE_DEFS, type Recipe } from '../../../sim/recipes/defs';
import { BANDEJA_BONUS } from '../../../sim/recipes/bandeja';
import { C } from '@pichi/screen-kit/art/tokens';
import { R } from '@pichi/screen-kit/art/gfx';
import { makeText } from '@pichi/screen-kit/art/fx';
import { foodKey, type FoodKind } from './kinds';
import { RECIPE_PIZZA } from './recipes';
import { place } from '../stations';

export interface Tray {
  objects: Phaser.GameObjects.GameObject[];
  /** The plates already on the window and the ms left of the margin (null: no plate served yet). */
  set(served: readonly boolean[] | undefined, marginLeftMs: number | null): void;
}

export function trayParts(s: Phaser.Scene, parts: readonly Recipe[]): Tray {
  const xs = [-40, 0, 40];
  const pizzas = parts.map((r, i) => place(s, foodKey(RECIPE_PIZZA[r] as FoodKind), xs[i]!, 62, 1).setScale(0.5 / R));
  const ticks = xs.map((x) => makeText(s, x, 52, '✓', { size: 26, color: C.cheese, stroke: 5, depth: 0 }).setVisible(false));
  const names = parts.map((r, i) =>
    makeText(s, xs[i]!, 80, RECIPE_DEFS[r].name.slice(0, 7).toUpperCase(), { size: 8, color: C.cream, stroke: 3, depth: 0 }),
  );
  const title = makeText(s, 0, 36, 'BANDEJA', { size: 13, color: C.cream, stroke: 4, depth: 0 });
  const bonus = makeText(s, 0, 91, `x${BANDEJA_BONUS}`, { size: 11, color: C.cheese, stroke: 3, depth: 0 });
  return {
    objects: [...pizzas, ...ticks, ...names, title, bonus],
    set(served, marginLeftMs) {
      pizzas.forEach((p, i) => p.setAlpha(served?.[i] ? 0.35 : 1));
      ticks.forEach((t, i) => t.setVisible(!!served?.[i]));
      bonus.setText(
        marginLeftMs === null
          ? `x${BANDEJA_BONUS}`
          : marginLeftMs > 0
            ? `x${BANDEJA_BONUS}  ${Math.ceil(marginLeftMs / 1000)}s`
            : 'sin bono',
      );
    },
  };
}

/** The balloon and the flat prize of the birthday ticket ("Pedido de cumpleaños", midround.ts) and its pink frame. */
export function birthdayParts(s: Phaser.Scene, frame: Phaser.GameObjects.Graphics): Phaser.GameObjects.GameObject[] {
  frame.clear().setVisible(true);
  frame.lineStyle(7, 0xa83572, 1).strokeRoundedRect(-62, 3, 124, 96, 10);
  frame.lineStyle(3, 0xff8cc4, 1).strokeRoundedRect(-62, 3, 124, 96, 10);
  return [
    place(s, 'balloon', -45, 36, 0.3)
      .setScale(0.3 / R)
      .setTint(0xe95fa5),
    makeText(s, 30, 20, '150', { size: 30, color: C.tomato, stroke: 6, depth: 0 }),
  ];
}
