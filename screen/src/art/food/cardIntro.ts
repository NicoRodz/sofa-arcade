// "Carta del día": during the countdown of a round whose map brings a card, a panel under the big number shows the 2 or 3 recipes of the round, each with its picture, its name
// and what it pays, so the table knows what the tickets will ask for before the first one arrives.
import type Phaser from 'phaser';
import type { Rec } from '@party/shared/recipes/sim';
import { RECIPE_DEFS, recipeBase } from '@party/shared/recipes/defs';
import { TUNING } from '@party/shared/difficulty';
import type { Difficulty } from '@party/shared/difficulty';
import { C, H, W, hexNum } from '../tokens';
import { R } from '../gfx';
import { foodKey, type FoodKind } from '../food';
import { place } from '../stations';
import { makeText } from '../fx';
import { RECIPE_PIZZA } from './recipes';

const SLOT = 190; // px between the pictures

export function cardIntro(scene: Phaser.Scene, rec: Rec, difficulty: Difficulty): Phaser.GameObjects.Container {
  const n = rec.recipes.length, w = n * SLOT + 60, h = 190;
  const bg = scene.add.graphics();
  bg.fillStyle(0x2b1b17, 0.3).fillRoundedRect(-w / 2 + 4, -h / 2 + 8, w, h, 26);
  bg.fillStyle(hexNum(C.cream), 1).fillRoundedRect(-w / 2, -h / 2, w, h, 26);
  bg.lineStyle(5, hexNum(C.ink), 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 26);
  const parts: Phaser.GameObjects.GameObject[] = [bg, makeText(scene, 0, -h / 2 + 24, 'CARTA DEL DÍA', { size: 26, color: C.tomato, stroke: 0, depth: 0 })];
  rec.recipes.forEach((r, i) => {
    const x = (i - (n - 1) / 2) * SLOT;
    parts.push(
      place(scene, foodKey(RECIPE_PIZZA[r] as FoodKind), x, -6, 1).setScale(1.5 / R),
      makeText(scene, x, 52, RECIPE_DEFS[r].name.toUpperCase(), { size: 22, color: C.ink, stroke: 0, depth: 0 }),
      makeText(scene, x, 76, `${recipeBase(r, TUNING[difficulty])} pts`, { size: 18, color: C.muted, stroke: 0, depth: 0 }),
    );
  });
  return scene.add.container(W / 2, H / 2 + 270, parts).setDepth(2590).setAlpha(0);
}
