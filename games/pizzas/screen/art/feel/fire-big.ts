// The BIG fire of HAZARD_V2, told at 3 m to a group that never played: the flames are 1.5x (BIG_K, applied by burn.ts), and over the station sits a panel with two chef slots that
// light up with each chef holding Picar, the douse bar, and a padlock over the bar when ONE chef is only containing it (the bar does not move) and a big label that says what is missing.
// Pure view: `update` reads what burn.ts already counts (the chefs in front of the station and the bar fraction); nothing here knows the rules but the number 2.
import type Phaser from 'phaser';
import { C, hexNum } from '@pichi/screen-kit/art/tokens';
import { makeText } from '@pichi/screen-kit/art/fx';

export const BIG_K = 1.5; // size of the flames of a big fire, relative to a small one
const NEEDED = 2; // chefs at once that make the bar move
const W = 330,
  H = 92;
const BAR = { x: 10, w: 150, h: 26 }; // the bar inside the panel, relative to its centre

export class BigFireMark {
  private g: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private t = 0;
  /** (x, y): the panel's centre; `labelDy`: where the caption goes relative to it (negative: above). */
  constructor(
    scene: Phaser.Scene,
    private x: number,
    private y: number,
    private labelDy: number,
  ) {
    this.g = scene.add.graphics().setDepth(3000);
    this.label = makeText(scene, x, y + labelDy, '', { size: 32, stroke: 7, depth: 3001 });
  }

  // a chef slot: hat, head and body; lit (a chef is there) or an empty dashed outline that pulses
  private chef(cx: number, cy: number, lit: boolean, pulse: number) {
    const g = this.g;
    if (lit) {
      g.fillStyle(0x2b1b17, 1).fillRoundedRect(cx - 17, cy - 3, 34, 30, 9);
      g.fillStyle(hexNum(C.cream), 1).fillRoundedRect(cx - 14, cy, 28, 24, 7);
      g.fillStyle(0x2b1b17, 1)
        .fillCircle(cx, cy - 8, 14)
        .fillRoundedRect(cx - 14, cy - 33, 28, 15, 6);
      g.fillStyle(0xf0c9a0, 1).fillCircle(cx, cy - 8, 11);
      g.fillStyle(hexNum(C.cream), 1).fillRoundedRect(cx - 11, cy - 30, 22, 12, 5);
      return;
    }
    g.fillStyle(hexNum(C.warn), 0.18 + 0.2 * pulse)
      .fillCircle(cx, cy - 8, 11)
      .fillRoundedRect(cx - 14, cy, 28, 24, 7);
    g.lineStyle(5, hexNum(C.warn), 0.6 + 0.4 * pulse);
    g.strokeCircle(cx, cy - 8, 11)
      .strokeRoundedRect(cx - 14, cy, 28, 24, 7)
      .strokeRoundedRect(cx - 11, cy - 30, 22, 12, 5);
  }

  private lock(cx: number, cy: number) {
    const g = this.g;
    g.lineStyle(9, 0x2b1b17, 1)
      .beginPath()
      .arc(cx, cy - 8, 12, Math.PI, 0, false)
      .strokePath();
    g.lineStyle(5, hexNum(C.cheese), 1)
      .beginPath()
      .arc(cx, cy - 8, 12, Math.PI, 0, false)
      .strokePath();
    g.fillStyle(0x2b1b17, 1).fillRoundedRect(cx - 19, cy - 8, 38, 30, 7);
    g.fillStyle(hexNum(C.cheese), 1).fillRoundedRect(cx - 16, cy - 5, 32, 24, 5);
    g.fillStyle(0x2b1b17, 1)
      .fillCircle(cx, cy + 5, 4)
      .fillRect(cx - 1.5, cy + 5, 3, 8);
  }

  /** `chefs`: how many are holding Picar here now; `frac`: 0..1 of the bar. */
  update(dtMs: number, chefs: number, frac: number) {
    this.t += dtMs;
    const g = this.g.clear(),
      { x, y } = this,
      pulse = 0.5 + 0.5 * Math.sin(this.t / 150);
    const ok = chefs >= NEEDED,
      held = chefs === 1;
    const edge = ok ? 0x7fd0f2 : hexNum(C.danger);
    const up = this.labelDy > 0 ? -1 : 1; // the pointer goes towards the oven: up when the panel hangs under it, down when it floats above
    g.fillStyle(0x2b1b17, 0.93).fillTriangle(x - 22, y + up * (H / 2 - 2), x + 22, y + up * (H / 2 - 2), x, y + up * (H / 2 + 24));
    g.fillStyle(0x000000, 0.35).fillRoundedRect(x - W / 2 + 4, y - H / 2 + 6, W, H, 18);
    g.fillStyle(0x2b1b17, 0.93).fillRoundedRect(x - W / 2, y - H / 2, W, H, 18);
    g.lineStyle(6, edge, ok ? 1 : 0.55 + 0.45 * pulse).strokeRoundedRect(x - W / 2, y - H / 2, W, H, 18);
    for (let i = 0; i < NEEDED; i++) this.chef(x - W / 2 + 50 + i * 62, y - 6, i < chefs, pulse);
    // the bar: cyan while it advances, orange and still while one chef contains the fire
    const bx = x + BAR.x + 12 - 2,
      by = y + 2;
    g.fillStyle(0x4a2c1e, 1).fillRoundedRect(bx - 4, by - BAR.h / 2 - 4, BAR.w + 8, BAR.h + 8, 11);
    const fw = Math.max(0, Math.min(1, frac)) * BAR.w;
    if (fw > 2) g.fillStyle(held ? hexNum(C.warn) : 0x7fd0f2, 1).fillRoundedRect(bx, by - BAR.h / 2, fw, BAR.h, 8);
    if (held) {
      g.lineStyle(4, 0x2b1b17, 0.55);
      for (let sx = bx + 14; sx < bx + BAR.w; sx += 26) g.lineBetween(sx, by + BAR.h / 2, sx + 12, by - BAR.h / 2); // diagonal hatching: frozen
      this.lock(bx + BAR.w / 2, by - 4);
    }
    const [text, color] = ok
      ? ['¡APAGANDO!', '#BFE8F5']
      : held
        ? ['SOLO LO CONTIENES · FALTA 1 MÁS', C.cheese]
        : ['¡FUEGO GRANDE! HACEN FALTA 2', '#FF8D8D'];
    this.label
      .setText(text)
      .setColor(color)
      .setScale(held || !ok ? 1 + 0.04 * pulse : 1);
  }

  destroy() {
    this.g.destroy();
    this.label.destroy();
  }
}
