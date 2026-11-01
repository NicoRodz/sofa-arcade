// DOM-side art: lobby logo, map preview, stars. Same procedural drawing as the in-game textures.
import { C, domCanvas, drawOutlined, star, vgrad, type Ctx } from '@pichi/screen-kit/art';
import { drawFood } from './food';
import { STATION_CHAR } from '../../sim/maps';

export function drawLogo(cv: HTMLCanvasElement) {
  const c = cv.getContext('2d')!;
  c.scale(2, 2);
  c.translate(52, 56);
  c.scale(1.7, 1.7);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  drawFood(c, 'pizza_done');
}

export function starCanvas(): HTMLCanvasElement {
  return domCanvas(
    70,
    70,
    35,
    36,
    (c: Ctx) => {
      drawOutlined(c, () => star(c, 0, 1, 31, 14), vgrad(c, -30, 30, '#FFE87A', C.cheese2), { lw: 4.5 });
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = 3.5;
      c.beginPath();
      c.arc(0, 2, 20, Math.PI * 1.15, Math.PI * 1.45);
      c.stroke();
    },
    4,
  );
}

const TILE_COLOR: Record<string, string> = {
  '#': '#5B4038',
  '.': '#EFE3CC',
  S: '#EFE3CC',
  '~': '#4FA8E0',
  C: '#C98A4B',
  [STATION_CHAR.crate0!]: C.dough,
  [STATION_CHAR.crate1!]: C.tomato,
  [STATION_CHAR.crate2!]: C.cheese,
  [STATION_CHAR.board!]: '#E6B980',
  [STATION_CHAR.pot!]: C.brick,
  [STATION_CHAR.plates!]: C.steel,
  [STATION_CHAR.window!]: C.fire2,
  [STATION_CHAR.trash!]: C.steel2,
  [STATION_CHAR.dirty!]: '#667782',
  [STATION_CHAR.sink!]: '#4FA8E0',
  [STATION_CHAR.saucepot!]: '#8C919B',
  [STATION_CHAR.counter1!]: '#E6B980',
};
export function drawMiniMap(cv: HTMLCanvasElement, rows: readonly string[]) {
  const c = cv.getContext('2d')!;
  const w = cv.width / 16,
    h = cv.height / 9;
  c.fillStyle = C.cocoa;
  c.fillRect(0, 0, cv.width, cv.height);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      c.fillStyle = TILE_COLOR[ch] ?? '#888';
      if (ch === '.' || ch === 'S') c.fillStyle = (x + y) % 2 ? '#E3D3B3' : '#EFE3CC';
      c.fillRect(x * w, y * h, w + 0.5, h + 0.5);
      if (ch === 'S') {
        c.fillStyle = 'rgba(43,27,23,0.55)';
        c.beginPath();
        c.arc((x + 0.5) * w, (y + 0.5) * h, 2.2, 0, Math.PI * 2);
        c.fill();
      }
      if (ch === 'E') {
        c.fillStyle = C.tomato;
        c.fillRect(x * w, y * h, w, 3);
      }
      if (ch === STATION_CHAR.board) {
        c.fillStyle = C.ink;
        c.fillRect(x * w + 3, y * h + h / 2 - 1, w - 6, 2);
      }
    }),
  );
}
