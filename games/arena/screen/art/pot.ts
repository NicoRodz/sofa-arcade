// A pinata is a pot of tempera with a fuse: the body in the colour of the team (dots for orange, stripes for blue, so it reads without colour), a face on the
// label, a dark lid and a wick that burns down with a spark on its tip. The big pinata of the event is the same pot in gold, twice as large, with a star.
// Vector, per frame: there are never more than a dozen on the floor.
import { A, TEAM_DARK, TEAM_HEX, num } from './palette';
import { CREAM, type G, INK, WHITE, star } from './shapes';

export interface PotLook {
  body: number;
  dark: number;
  team: number; // -1: the golden pot of the big pinata (no pattern)
}

export const potLook = (team: number): PotLook =>
  team < 0
    ? { body: num(A.gold), dark: num(A.goldDark), team }
    : { body: num(TEAM_HEX[team % 2]!), dark: num(TEAM_DARK[team % 2]!), team: team % 2 };

/** The pot standing on (cx, cy): `u` is the size of a tile, `fuse` the part of the wick left (0..1), `tick` flickers the spark. */
export function drawPot(g: G, cx: number, cy: number, u: number, look: PotLook, fuse: number, tick: number): void {
  const [bx, by, bw, bh] = [cx - 0.27 * u, cy - 0.16 * u, 0.54 * u, 0.5 * u];
  g.fillStyle(0x000000, 0.25).fillEllipse(cx + 0.03 * u, cy + 0.36 * u, 0.7 * u, 0.2 * u);
  g.fillStyle(look.body, 1).fillRoundedRect(bx, by, bw, bh, 0.1 * u);
  g.fillStyle(look.dark, 1).fillRoundedRect(bx, by + bh * 0.72, bw, bh * 0.28, { tl: 0, tr: 0, bl: 0.1 * u, br: 0.1 * u });
  if (look.team === 0)
    for (const [dx, dy] of [
      [-0.14, -0.07],
      [0.0, -0.1],
      [0.14, -0.07],
    ] as const)
      g.fillStyle(WHITE, 0.7).fillCircle(cx + dx * u, cy + dy * u, 0.04 * u);
  else if (look.team === 1)
    for (const dx of [-0.16, -0.05, 0.06, 0.17]) g.fillStyle(WHITE, 0.6).fillRect(cx + dx * u, by + 0.02 * u, 0.04 * u, 0.12 * u);
  else star(g, cx, by + 0.07 * u, 0.1 * u, 0.045 * u, 5, -Math.PI / 2, WHITE, INK, 2);
  g.fillStyle(CREAM, 1).fillRect(bx + 0.02 * u, cy + 0.02 * u, bw - 0.04 * u, 0.17 * u); // the label with its face
  g.fillStyle(INK, 1)
    .fillCircle(cx - 0.08 * u, cy + 0.09 * u, 0.025 * u)
    .fillCircle(cx + 0.08 * u, cy + 0.09 * u, 0.025 * u);
  g.lineStyle(2, INK, 1)
    .beginPath()
    .arc(cx, cy + 0.09 * u, 0.06 * u, 0.2, Math.PI - 0.2, false)
    .strokePath();
  g.lineStyle(3, INK, 1).strokeRoundedRect(bx, by, bw, bh, 0.1 * u);
  g.fillStyle(INK, 1).fillRoundedRect(cx - 0.31 * u, cy - 0.24 * u, 0.62 * u, 0.1 * u, 0.04 * u); // the lid
  g.fillStyle(WHITE, 0.35).fillRect(bx + 0.05 * u, by + 0.02 * u, 0.04 * u, 0.2 * u); // a shine
  // the wick: a curve of 5 segments, as long as the fuse that is left
  const len = (0.1 + 0.4 * Math.max(0, Math.min(1, fuse))) * u;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 5; i++) {
    const k = i / 5;
    pts.push([cx + Math.sin(k * 2.2) * 0.12 * u, cy - 0.24 * u - k * len]);
  }
  g.lineStyle(5, INK, 1).beginPath().moveTo(pts[0]![0], pts[0]![1]);
  for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
  g.strokePath();
  g.lineStyle(2.5, num('#E8C9A0'), 1).beginPath().moveTo(pts[0]![0], pts[0]![1]);
  for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
  g.strokePath();
  const [sx, sy] = pts[5]!;
  const flick = 0.12 + 0.03 * Math.sin(tick / 2);
  star(g, sx, sy, flick * u * 1.1, flick * u * 0.45, 6, tick / 9, num('#FF8A1F'), INK, 1.5);
  g.fillStyle(num(A.gold), 1).fillCircle(sx, sy, flick * u * 0.4);
}
