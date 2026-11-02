// The five F8a sabotage icons, in the style of glyphs.ts (a card with its own colour AND silhouette; ink on a bright disc): masking tape is a roll with a torn strip,
// invisible ink a dashed drop, the sponge a holey block, the swap two arrows going opposite ways, the dizzy a spiral.
import { num } from './palette';
import { type G, INK, WHITE, poly } from './shapes';

export type PlusIcon = 'tape' | 'ink' | 'sponge' | 'swap' | 'dizzy';
type Drawer = (g: G, x: number, y: number, r: number, spin: number) => void;

export const PLUS_HEX: Record<PlusIcon, string> = {
  tape: '#E6D5A8',
  ink: '#F4F4FA',
  sponge: '#7DE0B0',
  swap: '#FF7A7A',
  dizzy: '#9AA0FF',
};
export const PLUS_COLOR: Record<PlusIcon, number> = {
  tape: num(PLUS_HEX.tape),
  ink: num(PLUS_HEX.ink),
  sponge: num(PLUS_HEX.sponge),
  swap: num(PLUS_HEX.swap),
  dizzy: num(PLUS_HEX.dizzy),
};

/** A square-cornered spiral out from (x, y): `turns` turns, outer radius `r`, starting at angle `a0`. */
export function spiralPts(x: number, y: number, r: number, turns: number, a0 = 0, steps = 36): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, k): [number, number] => {
    const t = k / steps;
    const a = a0 + t * turns * Math.PI * 2;
    return [x + Math.cos(a) * r * t, y + Math.sin(a) * r * t];
  });
}

const arrow = (g: G, x0: number, x1: number, y: number, r: number) => {
  const dir = Math.sign(x1 - x0);
  g.lineStyle(4, INK, 1)
    .beginPath()
    .moveTo(x0, y)
    .lineTo(x1 - dir * r * 0.1, y)
    .strokePath();
  poly(
    g,
    [
      [x1, y],
      [x1 - dir * r * 0.3, y - r * 0.24],
      [x1 - dir * r * 0.3, y + r * 0.24],
    ],
    INK,
  );
};

export const PLUS_ICONS: Record<PlusIcon, Drawer> = {
  tape(g, x, y, r) {
    poly(
      g,
      [
        [x + r * 0.05, y + r * 0.34],
        [x + r * 0.7, y + r * 0.34],
        [x + r * 0.62, y + r * 0.45],
        [x + r * 0.7, y + r * 0.56],
        [x + r * 0.05, y + r * 0.56],
      ],
      WHITE,
      INK,
      2.5,
    ); // the torn strip
    g.fillStyle(INK, 1).fillCircle(x - r * 0.1, y - r * 0.05, r * 0.56);
    g.fillStyle(WHITE, 1).fillCircle(x - r * 0.1, y - r * 0.05, r * 0.28); // the hole of the roll
    g.lineStyle(3, WHITE, 1)
      .beginPath()
      .arc(x - r * 0.1, y - r * 0.05, r * 0.42, Math.PI * 1.1, Math.PI * 1.6)
      .strokePath();
  },
  ink(g, x, y, r) {
    const drop: [number, number][] = [[x, y - r * 0.66]];
    for (let k = 0; k <= 12; k++) {
      const a = Math.PI * (0.78 - (k / 12) * 1.56) + Math.PI / 2; // round belly from the right flank to the left
      drop.push([x + Math.cos(a) * r * 0.46, y + r * 0.14 + Math.sin(a) * r * 0.46]);
    }
    poly(g, drop, WHITE, INK, 5); // a solid, thick outline: the drop is there but empty (invisible)
    g.lineStyle(4, INK, 1)
      .beginPath()
      .moveTo(x - r * 0.58, y + r * 0.62)
      .lineTo(x + r * 0.58, y - r * 0.5)
      .strokePath(); // struck through: you cannot see it
  },
  sponge(g, x, y, r) {
    g.fillStyle(WHITE, 1).fillRoundedRect(x - r * 0.6, y - r * 0.4, r * 1.2, r * 0.8, r * 0.22);
    g.lineStyle(3, INK, 1).strokeRoundedRect(x - r * 0.6, y - r * 0.4, r * 1.2, r * 0.8, r * 0.22);
    for (const [dx, dy, rr] of [
      [-0.3, -0.12, 0.13],
      [0.12, -0.2, 0.09],
      [0.34, 0.08, 0.14],
      [-0.08, 0.16, 0.11],
      [-0.38, 0.22, 0.07],
    ] as const)
      g.fillStyle(INK, 1).fillCircle(x + dx * r, y + dy * r, rr * r);
  },
  swap(g, x, y, r) {
    arrow(g, x - r * 0.56, x + r * 0.56, y - r * 0.3, r);
    arrow(g, x + r * 0.56, x - r * 0.56, y + r * 0.3, r);
  },
  dizzy(g, x, y, r, spin) {
    const pts = spiralPts(x, y, r * 0.62, 2.4, spin);
    g.lineStyle(4.5, INK, 1).beginPath().moveTo(pts[0]![0], pts[0]![1]);
    for (const [px, py] of pts) g.lineTo(px, py);
    g.strokePath();
    g.fillStyle(INK, 1).fillCircle(x, y, r * 0.07);
  },
};
