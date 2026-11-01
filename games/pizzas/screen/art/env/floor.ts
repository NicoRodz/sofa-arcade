import type { Grid } from '../../../sim/maps';
import { C, H, HUD_H, W, rng, vgrad, type Ctx } from '@pichi/screen-kit/art';
import { type Kind, kindOf, rrc, benchTop, wallTop } from './tiles';

export function outerWall(c: Ctx) {
  c.fillStyle = C.cocoa;
  c.fillRect(0, 0, W, H);
  c.fillStyle = vgrad(c, 0, H, '#46332B', '#352620');
  c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(0,0,0,0.22)';
  c.lineWidth = 2;
  const bh = 24,
    bw = 64;
  for (let y = 0, row = 0; y < H; y += bh, row++) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
    for (let x = (row % 2) * (bw / 2); x < W; x += bw) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + bh);
      c.stroke();
    }
  }
  c.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0, row = 0; y < H; y += bh, row++)
    for (let x = (row % 2) * (bw / 2); x < W; x += bw) if ((x / bw + row) % 3 === 0) c.fillRect(x + 2, y + 2, bw - 4, bh - 4);
  // HUD trim
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.fillRect(0, 0, W, HUD_H - 8);
  c.fillStyle = C.wallTop;
  c.fillRect(0, HUD_H - 8, W, 8);
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.fillRect(0, HUD_H - 8, W, 2);
  c.fillStyle = C.ink;
  c.fillRect(0, HUD_H, W, 3);
}

export function floorPass(c: Ctx, g: Grid, pair: [string, string]) {
  g.forEach((row, ty) =>
    row.forEach((t, tx) => {
      if (t.kind !== 'floor') return;
      const x0 = tx * 120,
        y0 = ty * 120;
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          c.fillStyle = (tx * 2 + i + ty * 2 + j) % 2 ? pair[1] : pair[0];
          c.fillRect(x0 + i * 60, y0 + j * 60, 60, 60);
        }
      c.strokeStyle = 'rgba(80,50,20,0.06)';
      c.lineWidth = 1;
      c.strokeRect(x0, y0, 60, 60);
      c.strokeRect(x0 + 60, y0, 60, 60);
      c.strokeRect(x0, y0 + 60, 60, 60);
      c.strokeRect(x0 + 60, y0 + 60, 60, 60);
      const n = kindOf(g, tx, ty - 1),
        w = kindOf(g, tx - 1, ty),
        e = kindOf(g, tx + 1, ty);
      if (n === 'bench' || n === 'wall' || n === 'oven' || n === 'out') {
        c.fillStyle = vgrad(c, y0, y0 + 22, 'rgba(50,25,10,0.34)', 'rgba(50,25,10,0)');
        c.fillRect(x0, y0, 120, 22);
      }
      if (w === 'bench' || w === 'wall' || w === 'oven') {
        const gr = c.createLinearGradient(x0, 0, x0 + 12, 0);
        gr.addColorStop(0, 'rgba(50,25,10,0.22)');
        gr.addColorStop(1, 'rgba(50,25,10,0)');
        c.fillStyle = gr;
        c.fillRect(x0, y0, 12, 120);
      }
      if (e === 'bench' || e === 'wall' || e === 'oven') {
        const gr = c.createLinearGradient(x0 + 120, 0, x0 + 108, 0);
        gr.addColorStop(0, 'rgba(50,25,10,0.16)');
        gr.addColorStop(1, 'rgba(50,25,10,0)');
        c.fillStyle = gr;
        c.fillRect(x0 + 108, y0, 12, 120);
      }
    }),
  );
}

export function waterPass(c: Ctx, g: Grid) {
  g.forEach((row, ty) =>
    row.forEach((t, tx) => {
      if (t.kind !== 'water') return;
      const x0 = tx * 120,
        y0 = ty * 120;
      c.fillStyle = vgrad(c, y0, y0 + 120, '#63C1EE', '#2F7DB8');
      c.fillRect(x0, y0, 120, 120);
      const n = kindOf(g, tx, ty - 1);
      if (n !== 'water' && n !== 'floor') {
        c.fillStyle = vgrad(c, y0, y0 + 30, 'rgba(10,40,80,0.45)', 'rgba(10,40,80,0)');
        c.fillRect(x0, y0, 120, 30);
      }
      const rnd = rng(tx * 31 + ty * 17 + 5);
      c.strokeStyle = 'rgba(255,255,255,0.42)';
      c.lineWidth = 3;
      c.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const x = x0 + 14 + rnd() * 70,
          y = y0 + 14 + i * 26 + rnd() * 8;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + 10, y - 7, x + 20, y);
        c.quadraticCurveTo(x + 30, y + 7, x + 40, y);
        c.stroke();
      }
    }),
  );
}

export function masses(c: Ctx, g: Grid) {
  const mass = (k: Kind) => k === 'bench' || k === 'wall';
  const radii = (tx: number, ty: number, k: Kind): [number, number, number, number] => {
    const same = (dx: number, dy: number) => kindOf(g, tx + dx, ty + dy) === k;
    const r = (a: boolean, b: boolean) => (!a && !b ? 14 : 0);
    return [r(same(0, -1), same(-1, 0)), r(same(0, -1), same(1, 0)), r(same(0, 1), same(1, 0)), r(same(0, 1), same(-1, 0))];
  };
  const tiles: [number, number, Kind][] = [];
  g.forEach((_row, ty) =>
    _row.forEach((_t, tx) => {
      const k = kindOf(g, tx, ty);
      if (mass(k)) tiles.push([tx, ty, k]);
    }),
  );
  // outline layer: the same shapes grown by the ink width
  for (const [tx, ty, k] of tiles) {
    const rd = radii(tx, ty, k).map((v) => (v ? v + 3 : 0)) as [number, number, number, number];
    rrc(c, tx * 120 - 3, ty * 120 - 3, 126, 126, rd);
    c.fillStyle = C.ink;
    c.fill();
  }
  for (const [tx, ty, k] of tiles) {
    c.save();
    rrc(c, tx * 120, ty * 120, 120, 120, radii(tx, ty, k));
    c.clip();
    if (k === 'bench') benchTop(c, g, tx, ty);
    else wallTop(c, g, tx, ty);
    c.restore();
  }
  // seams between different masses
  c.strokeStyle = C.ink;
  c.lineWidth = 3;
  for (const [tx, ty, k] of tiles) {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const n = kindOf(g, tx + dx, ty + dy);
      if (n !== k && (mass(n) || n === 'oven')) {
        c.beginPath();
        if (dx) {
          c.moveTo((tx + 1) * 120, ty * 120);
          c.lineTo((tx + 1) * 120, (ty + 1) * 120);
        } else {
          c.moveTo(tx * 120, (ty + 1) * 120);
          c.lineTo((tx + 1) * 120, (ty + 1) * 120);
        }
        c.stroke();
      }
    }
  }
}
