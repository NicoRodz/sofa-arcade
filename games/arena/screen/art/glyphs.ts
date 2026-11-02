// The ten sabotage icons (the five of v1 here, the five of F8a in glyphs-plus.ts), each a card with its own colour AND its own silhouette (so it reads without colour): turpentine is a flask, the roller a paint
// roller, the fan a ventilator that turns, the footprints two soles, the glue an upside-down bottle with a drip. Ink on a bright disc with a white rim.
import type { SabotageKind } from '../../sim';
import { num } from './palette';
import { PLUS_COLOR, PLUS_HEX, PLUS_ICONS } from './glyphs-plus';
import { type G, INK, WHITE, poly, tilted } from './shapes';

export const CARD_HEX: Record<SabotageKind, string> = {
  turpentine: '#7FE3FF',
  roller: '#FFD166',
  fan: '#A6F07A',
  footprints: '#FF8FD8',
  glue: '#C8A2FF',
  ...PLUS_HEX,
};
export const CARD_COLOR: Record<SabotageKind, number> = {
  turpentine: num(CARD_HEX.turpentine),
  roller: num(CARD_HEX.roller),
  fan: num(CARD_HEX.fan),
  footprints: num(CARD_HEX.footprints),
  glue: num(CARD_HEX.glue),
  ...PLUS_COLOR,
};

const ICONS: Record<SabotageKind, (g: G, x: number, y: number, r: number, spin: number) => void> = {
  ...PLUS_ICONS,
  turpentine(g, x, y, r) {
    poly(
      g,
      [
        [x - r * 0.14, y - r * 0.6],
        [x + r * 0.14, y - r * 0.6],
        [x + r * 0.14, y - r * 0.18],
        [x + r * 0.5, y + r * 0.5],
        [x - r * 0.5, y + r * 0.5],
        [x - r * 0.14, y - r * 0.18],
      ],
      WHITE,
      INK,
      3,
    );
    poly(
      g,
      [
        [x - r * 0.3, y + r * 0.12],
        [x + r * 0.3, y + r * 0.12],
        [x + r * 0.5, y + r * 0.5],
        [x - r * 0.5, y + r * 0.5],
      ],
      INK,
    ); // the liquid
    g.fillStyle(INK, 1).fillRoundedRect(x - r * 0.22, y - r * 0.74, r * 0.44, r * 0.18, 2);
  },
  roller(g, x, y, r) {
    g.fillStyle(INK, 1).fillRoundedRect(x - r * 0.62, y - r * 0.55, r * 1.24, r * 0.5, r * 0.18);
    g.fillStyle(WHITE, 1).fillRect(x - r * 0.46, y - r * 0.42, r * 0.92, r * 0.1);
    g.lineStyle(3, INK, 1)
      .beginPath()
      .moveTo(x + r * 0.62, y - r * 0.3)
      .lineTo(x + r * 0.78, y - r * 0.3)
      .lineTo(x + r * 0.78, y + r * 0.1)
      .lineTo(x, y + r * 0.1)
      .lineTo(x, y + r * 0.25)
      .strokePath();
    g.fillStyle(INK, 1).fillRoundedRect(x - r * 0.1, y + r * 0.22, r * 0.2, r * 0.52, 3);
  },
  fan(g, x, y, r, spin) {
    for (let k = 0; k < 4; k++)
      poly(
        g,
        tilted(
          x + Math.cos(spin + (k * Math.PI) / 2) * r * 0.36,
          y + Math.sin(spin + (k * Math.PI) / 2) * r * 0.36,
          r * 0.34,
          r * 0.17,
          spin + (k * Math.PI) / 2 + 0.5,
        ),
        WHITE,
        INK,
        2.5,
      );
    g.lineStyle(3, INK, 1).strokeCircle(x, y, r * 0.72);
    g.fillStyle(INK, 1).fillCircle(x, y, r * 0.14);
  },
  footprints(g, x, y, r) {
    for (const [dx, dy, rot] of [
      [-0.3, 0.15, -0.2],
      [0.3, -0.22, 0.2],
    ] as const) {
      poly(g, tilted(x + dx * r, y + dy * r - r * 0.12, r * 0.2, r * 0.28, rot), INK);
      poly(g, tilted(x + dx * r, y + dy * r + r * 0.32, r * 0.15, r * 0.14, rot), INK);
    }
  },
  glue(g, x, y, r) {
    poly(
      g,
      [
        [x - r * 0.38, y - r * 0.62],
        [x + r * 0.38, y - r * 0.62],
        [x + r * 0.38, y + r * 0.05],
        [x + r * 0.1, y + r * 0.3],
        [x - r * 0.1, y + r * 0.3],
        [x - r * 0.38, y + r * 0.05],
      ],
      WHITE,
      INK,
      3,
    );
    g.fillStyle(INK, 1).fillRect(x - r * 0.38, y - r * 0.38, r * 0.76, r * 0.2); // the label
    g.fillStyle(INK, 1)
      .fillCircle(x, y + r * 0.56, r * 0.14)
      .fillTriangle(x - r * 0.1, y + r * 0.5, x + r * 0.1, y + r * 0.5, x, y + r * 0.3);
  },
};

/** The card's icon centred on (cx, cy), r = half its size. `spin` (radians) turns the fan. */
export function drawIcon(g: G, kind: SabotageKind, cx: number, cy: number, r: number, spin = 0): void {
  g.fillStyle(0x000000, 0.25).fillCircle(cx + 2, cy + 3, r);
  g.fillStyle(CARD_COLOR[kind], 1).fillCircle(cx, cy, r);
  g.lineStyle(Math.max(3, r * 0.12), WHITE, 1).strokeCircle(cx, cy, r);
  g.lineStyle(2, INK, 0.9).strokeCircle(cx, cy, r + 1.5);
  ICONS[kind](g, cx, cy, r, spin);
}
