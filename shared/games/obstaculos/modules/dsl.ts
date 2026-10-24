import { GROUND_ROW, MODULE_ROWS, type LevelModule } from './types';

// Small canvas to author a module: empty air above a floor of 3 rows (top = GROUND_ROW + 1).
export class Canvas {
  readonly g: string[][];
  constructor(readonly w: number) {
    this.g = Array.from({ length: MODULE_ROWS }, (_, y) => Array<string>(w).fill(y > GROUND_ROW ? '#' : '.'));
  }
  rect(x0: number, y0: number, x1: number, y1: number, ch: string): this {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && x < this.w && y >= 0 && y < MODULE_ROWS) this.g[y]![x] = ch;
    return this;
  }
  set(x: number, y: number, ch: string): this { return this.rect(x, y, x, y, ch); }
  // a pit through the floor: columns x0..x1, filled with `fill` from `fromRow` down
  pit(x0: number, x1: number, fill: string, fromRow = GROUND_ROW + 1): this { return this.rect(x0, GROUND_ROW + 1, x1, MODULE_ROWS - 1, '.').rect(x0, fromRow, x1, MODULE_ROWS - 1, fill); }
  rows(): string[] { return this.g.map((r) => r.join('')); }
}

export const mod = (m: Omit<LevelModule, 'rows' | 'w'> & { c: Canvas }): LevelModule => {
  const { c, ...rest } = m;
  return { ...rest, w: c.w, rows: c.rows() };
};
