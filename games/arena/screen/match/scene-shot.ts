// Manchazo's scene, projectile layer (PR4): the aim (a dashed line 7 tiles long along the body's heading and a ring that fills over the 12 ticks), the shot in flight
// (its card in a team-coloured halo with a trail), what it did (a clash starburst, a hit ring, a puff where it ended, the arc of a pass) and the passable Pegote on its
// carrier (fuse ring with a spark, one pip per pass, the lock or the "ready" ring). Everything is chunky: it has to read from the sofa. No logic: it reads the sim's state.
import { solidAt } from '../../map';
import { AIM_TICKS, MAX_PASSES, PASS_LOCK_TICKS, SHOT_RANGE_TILES, bodyTile, canPass, type ManchazoState, type Pinata } from '../../sim';
import { CARD_COLOR, drawIcon } from '../art/glyphs';
import { TEAM_COLOR } from './scene-body';
import { onTop, type Frame } from './scene-frame';

const UNIT = (f: Frame) => f.px / 16;
const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;
const INK = 0x24160f;
export const FX_TICKS = 30; // how long what a shot did stays on screen at most
const FUSE_FULL = 120;

/** How many tiles (from the centre of the shooter's tile) a shot along `dir` flies: the range, or less when a wall or a piece of furniture stops it (it dies at the tile's edge). */
export function aimLength(s: ManchazoState, tx: number, ty: number, dir: number): number {
  const [dx, dy] = DIRS[dir as 0 | 1 | 2 | 3] ?? DIRS[0];
  for (let k = 1; k <= SHOT_RANGE_TILES; k++) if (solidAt(s.grid.map, tx + dx * k, ty + dy * k)) return k - 0.5;
  return SHOT_RANGE_TILES;
}

const bodyPx = (f: Frame, s: ManchazoState, i: number): [number, number] => {
  const b = s.grid.bodies[i]!;
  return [f.x0 + b.x * UNIT(f), f.y0 + b.y * UNIT(f)];
};
const tilePx = (f: Frame, x: number, y: number): [number, number] => [f.x0 + x * f.px + f.px / 2, f.y0 + y * f.px + f.px / 2];

function arrow(g: Frame['g'], x: number, y: number, dx: number, dy: number, size: number, color: number, alpha = 1) {
  const [nx, ny] = [-dy, dx];
  const tri = (k: number) =>
    [
      x + dx * size * k + nx * size * 0.7,
      y + dy * size * k + ny * size * 0.7,
      x + dx * size * k - nx * size * 0.7,
      y + dy * size * k - ny * size * 0.7,
      x + dx * size * (k + 1.1),
      y + dy * size * (k + 1.1),
    ] as const;
  const [a, b, c, d, e, h] = tri(-0.3);
  g.fillStyle(INK, alpha).fillTriangle(a - dx * 4, b - dy * 4, c - dx * 4, d - dy * 4, e + dx * 6, h + dy * 6);
  g.fillStyle(color, alpha).fillTriangle(a, b, c, d, e, h);
}

/** Under the bodies: for each body that is aiming, the line along its heading, the ring that fills (full = the shot leaves) and the card at the tip. */
export function drawAim(f: Frame, s: ManchazoState) {
  const sh = s.match.sab?.shot;
  if (!sh) return;
  const g = onTop(f).g;
  s.grid.bodies.forEach((b, i) => {
    const left = sh.prep[i]!;
    const card = s.match.sab!.held[i];
    if (left <= 0 || !card) return;
    const m = s.match.bodies[i]!;
    const [tx, ty] = bodyTile(b, m.face);
    const dir = m.face < 0 ? 0 : m.face;
    const [dx, dy] = DIRS[dir as 0 | 1 | 2 | 3]!;
    const len = aimLength(s, tx, ty, dir) * f.px;
    const [cx, cy] = tilePx(f, tx, ty);
    const col = TEAM_COLOR[b.team % 2]!;
    const t = 1 - left / AIM_TICKS;
    const march = (s.grid.tick * 3) % (f.px * 0.5); // the dashes run toward the tip
    f.g.lineStyle(16, INK, 0.5).lineBetween(cx, cy, cx + dx * len, cy + dy * len);
    for (let o = -f.px * 0.5 + march; o < len - f.px * 0.3; o += f.px * 0.5) {
      const [a, e] = [Math.max(o, f.px * 0.3), Math.min(o + f.px * 0.3, len - f.px * 0.3)];
      if (e > a) f.g.lineStyle(10, col, 0.95).lineBetween(cx + dx * a, cy + dy * a, cx + dx * e, cy + dy * e);
    }
    const [x, y] = bodyPx(f, s, i);
    g.lineStyle(14, INK, 0.6).strokeCircle(x, y, f.px * 0.82);
    g.beginPath()
      .lineStyle(10, 0xffffff, 1)
      .arc(x, y, f.px * 0.82, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t, false)
      .strokePath();
    g.lineStyle(4, col, 1).strokeCircle(x, y, f.px * 0.94);
    arrow(g, cx + dx * (len - f.px * 0.55), cy + dy * (len - f.px * 0.55), dx, dy, f.px * 0.34, col, 0.4 + 0.6 * t);
    if (len > f.px) drawIcon(g, card, cx + dx * (len + f.px * 0.35), cy + dy * (len + f.px * 0.35), f.px * 0.32, s.grid.tick / 6);
  });
}

/** The shots in the air and what the last ticks of the log did. Above the avatars. */
export function drawShots(f: Frame, s: ManchazoState) {
  const sh = s.match.sab?.shot;
  if (!sh) return;
  const g = onTop(f).g;
  for (const p of sh.shots) {
    const [x, y] = [f.x0 + p.x * UNIT(f), f.y0 + p.y * UNIT(f)];
    const [dx, dy] = DIRS[p.dir as 0 | 1 | 2 | 3] ?? DIRS[0];
    const col = TEAM_COLOR[p.team % 2]!;
    for (let k = 4; k >= 1; k--)
      g.fillStyle(col, 0.5 - k * 0.1).fillCircle(x - dx * k * f.px * 0.3, y - dy * k * f.px * 0.3, f.px * (0.42 - k * 0.05)); // the trail, behind the shot
    g.fillStyle(col, 0.55).fillCircle(x, y, f.px * 0.62 + 3 * Math.sin(s.grid.tick / 2));
    g.lineStyle(6, INK, 0.9).strokeCircle(x, y, f.px * 0.52);
    drawIcon(g, p.kind, x, y, f.px * 0.44, s.grid.tick / 3);
    g.lineStyle(5, col, 1).strokeCircle(x, y, f.px * 0.58);
    arrow(g, x + dx * f.px * 0.55, y + dy * f.px * 0.55, dx, dy, f.px * 0.2, 0xffffff);
  }
  drawFx(f, s, g, sh.log);
}

function drawFx(
  f: Frame,
  s: ManchazoState,
  g: Frame['g'],
  log: readonly { kind: string; tick: number; body: number; target: number; x: number; y: number; card: keyof typeof CARD_COLOR }[],
) {
  for (let k = log.length - 1; k >= 0; k--) {
    const e = log[k]!;
    const age = s.grid.tick - e.tick;
    if (age >= FX_TICKS) break;
    if (age < 0) continue;
    const t = age / FX_TICKS;
    const [x, y] = tilePx(f, e.x, e.y);
    const col = CARD_COLOR[e.card];
    if (e.kind === 'clash') {
      const r = f.px * (0.4 + 0.9 * t);
      for (let a = 0; a < 8; a++) {
        const w = (a * Math.PI) / 4 + 0.2;
        g.lineStyle(8, a % 2 ? 0xffe066 : 0xffffff, 1 - t).lineBetween(
          x + Math.cos(w) * r * 0.5,
          y + Math.sin(w) * r * 0.5,
          x + Math.cos(w) * r * 1.2,
          y + Math.sin(w) * r * 1.2,
        );
      }
      g.lineStyle(7, TEAM_COLOR[0]!, 1 - t).strokeCircle(x, y, r * 0.8);
      g.lineStyle(7, TEAM_COLOR[1]!, 1 - t).strokeCircle(x, y, r * 0.55);
    } else if (e.kind === 'hit' && e.target >= 0 && t < 0.7) {
      const [bx, by] = bodyPx(f, s, e.target);
      g.lineStyle(10, col, 1 - t / 0.7).strokeCircle(bx, by, f.px * (0.5 + 0.9 * t));
      g.lineStyle(5, 0xffffff, 1 - t / 0.7).strokeCircle(bx, by, f.px * (0.6 + 1.0 * t));
    } else if (e.kind === 'miss' && t < 0.55) {
      for (let a = 0; a < 3; a++)
        g.fillStyle(col, 0.7 * (1 - t / 0.55)).fillCircle(
          x + Math.cos(a * 2.1) * f.px * 0.4 * t,
          y + Math.sin(a * 2.1) * f.px * 0.4 * t,
          f.px * (0.34 - 0.2 * t),
        );
    } else if (e.kind === 'cancel' && t < 0.6) {
      const r = f.px * 0.3;
      g.lineStyle(9, INK, 1 - t / 0.6)
        .lineBetween(x - r, y - r, x + r, y + r)
        .lineBetween(x - r, y + r, x + r, y - r);
      g.lineStyle(5, 0xffffff, 1 - t / 0.6)
        .lineBetween(x - r, y - r, x + r, y + r)
        .lineBetween(x - r, y + r, x + r, y - r);
    } else if (e.kind === 'pass' && e.target >= 0) {
      const [ax, ay] = bodyPx(f, s, e.body);
      const [bx, by] = bodyPx(f, s, e.target);
      const own = TEAM_COLOR[s.grid.bodies[e.body]!.team % 2]!; // the Pegote takes the colour of whoever passes it
      const [dx, dy] = [bx - ax, by - ay];
      const n = Math.hypot(dx, dy) || 1;
      const a = 1 - t;
      g.lineStyle(18, INK, 0.55 * a).lineBetween(ax, ay, bx, by);
      g.lineStyle(11, own, a).lineBetween(ax, ay, bx, by);
      arrow(g, bx - (dx / n) * f.px * 0.9, by - (dy / n) * f.px * 0.9, dx / n, dy / n, f.px * 0.3, own, a);
      g.lineStyle(8, 0xffffff, a).strokeCircle(bx, by, f.px * (0.55 + 0.7 * t));
    }
  }
}

const fuseColor = (fuse: number): number => (fuse > 72 ? 0xffe066 : fuse > 36 ? 0xff9f1c : 0xff3b30);

/** A Pegote riding body i at (x, y): the fuse ring with its spark, a pip per pass (filled = passed), the lock draining or the ring that says "B passes it". */
export function drawGlueCarrier(f: Frame, s: ManchazoState, i: number, x: number, y: number) {
  const p: Pinata | undefined = s.match.pinatas
    .filter((q) => q.mod === 'glue' && q.stuck === i && q.passes !== undefined)
    .sort((a, b) => a.id - b.id)[0];
  if (!p) return;
  const g = onTop(f).g;
  const col = TEAM_COLOR[p.team % 2]!;
  const r = f.px * 1.02;
  const left = Math.min(1, Math.max(0, p.fuse) / FUSE_FULL);
  const flash = p.fuse <= 36 && Math.floor(s.grid.tick / 4) % 2 === 0;
  const a0 = -Math.PI / 2;
  const a1 = a0 + Math.PI * 2 * left;
  g.lineStyle(17, INK, 0.7).strokeCircle(x, y, r);
  g.beginPath()
    .lineStyle(11, flash ? 0xffffff : fuseColor(p.fuse), 1)
    .arc(x, y, r, a0, a1, false)
    .strokePath();
  g.fillStyle(0xffffff, 1).fillCircle(x + Math.cos(a1) * r, y + Math.sin(a1) * r, 8 + 3 * Math.sin(s.grid.tick)); // the spark at the burning end
  g.fillStyle(0xffe066, 0.9).fillCircle(x + Math.cos(a1) * r, y + Math.sin(a1) * r, 14);
  g.lineStyle(5, col, 1).strokeCircle(x, y, r + 11);
  const used = p.passes ?? 0;
  for (let k = 0; k < MAX_PASSES; k++) {
    const [px, py] = [x - f.px * 0.5 + k * f.px * 0.5, y - f.px * 1.72];
    g.fillStyle(INK, 0.85).fillCircle(px, py, f.px * 0.22);
    if (k < used) g.fillStyle(col, 1).fillCircle(px, py, f.px * 0.16);
    g.lineStyle(4, 0xffffff, 1).strokeCircle(px, py, f.px * 0.22);
  }
  if ((p.lock ?? 0) > 0) {
    g.beginPath()
      .lineStyle(8, 0x9aa0a6, 1)
      .arc(x, y, f.px * 0.66, a0, a0 + Math.PI * 2 * ((p.lock ?? 0) / PASS_LOCK_TICKS), false)
      .strokePath();
  } else if (canPass(s, i)) g.lineStyle(7, 0xffffff, 0.5 + 0.5 * Math.sin(s.grid.tick / 4)).strokeCircle(x, y, f.px * 0.7);
}
