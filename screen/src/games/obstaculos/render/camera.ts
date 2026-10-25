// Shared camera (plan §6). Pure: no Phaser, no Date, no random. The scene feeds it the players' centres every render frame and
// applies the result to its camera. Straggler timers live in StragglerTracker; the world turns "reached the limit" into a bubble.
import { RUN_SPEED, T, TILE, ZOOM_MAX, ZOOM_MIN, isSolidKind, tileAt, type Cell, type Rect, type TileGrid } from '@party/shared/obstaculos';

export const VIEW_W = 1920; // logical canvas of the screen app
export const VIEW_H = 1080;
export const FRAME_PAD = TILE * 3; // margin kept around the focus group
export const LEAD = 0.15; // look-ahead: this fraction of the half-view, toward where the group is heading
export const OMEGA_POS = 6;
export const OMEGA_ZOOM_OUT = 5; // "alejar"
export const OMEGA_ZOOM_IN = 2; // "acercar"
export const BOTTOM_STRIP = 220; // px of ground shown under the level when the level is shorter than the view
export const OFFSCREEN_MARGIN = 0; // px inside the view edge that still counts as visible

export interface CamPlayer {
  id: number;
  x: number;
  y: number; // centre of the body, px
  vx: number;
  progress: number; // BFS distance to the goal (smaller = closer)
  active: boolean; // alive, connected and not in a bubble: counts for the focus
  visibleCheck: boolean; // true if an arrow should be shown when it is out of the picture (alive and connected, bubble or not)
}
export interface CamState {
  cx: number;
  cy: number;
  zoom: number;
  vcx: number;
  vcy: number;
  vz: number;
  lead: number;
}
// Campaign hints (shared `cameraHints(world)`): look toward the goal instead of where the group runs, keep the chasing hazard in the picture
// ("in the bosses the danger pushes the camera"). Absent = the quick match camera, unchanged.
export interface CamLook {
  goalX: number | null;
  hazard: { kind: 'risingLava' | 'tide' | 'avalanche'; pos: number } | null;
  padTiles: number;
}
export interface CamInput {
  players: readonly CamPlayer[];
  boundsW: number;
  boundsH: number;
  zones?: readonly Rect[];
  viewW?: number;
  viewH?: number;
  look?: CamLook;
}
export interface Offscreen {
  id: number;
  dirX: number;
  dirY: number;
  dist: number;
} // unit direction from the view centre, distance in px beyond the edge
export interface CamResult {
  state: CamState;
  rect: Rect; // world px visible
  focus: number[]; // ids framed
  median: number; // id, -1 when nobody is active
  zone: number; // index of the camera zone in force, -1 none
  offscreen: Offscreen[];
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// Critically damped spring, integrated in small sub-steps so a long frame never explodes.
function spring(x: number, v: number, target: number, omega: number, dt: number): [number, number] {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    v += (omega * omega * (target - x) - 2 * omega * v) * h;
    x += v * h;
  }
  return [x, v];
}

// Largest run of players (sorted by progress) that contains the median and still fits at the minimum zoom; ties: smaller box.
export function chooseFocus(sorted: readonly CamPlayer[], medianIdx: number, viewW: number, viewH: number): CamPlayer[] {
  const maxW = viewW / ZOOM_MIN - 2 * FRAME_PAD,
    maxH = viewH / ZOOM_MIN - 2 * FRAME_PAD;
  let best: { i: number; j: number; area: number } | null = null;
  for (let i = 0; i <= medianIdx; i++) {
    for (let j = sorted.length - 1; j >= medianIdx; j--) {
      const run = sorted.slice(i, j + 1);
      const w = Math.max(...run.map((p) => p.x)) - Math.min(...run.map((p) => p.x));
      const h = Math.max(...run.map((p) => p.y)) - Math.min(...run.map((p) => p.y));
      if (w > maxW || h > maxH) continue;
      const area = w * h;
      const count = j - i + 1,
        bestCount = best ? best.j - best.i + 1 : 0;
      if (!best || count > bestCount || (count === bestCount && area < best.area)) best = { i, j, area };
    }
  }
  return best ? sorted.slice(best.i, best.j + 1) : [sorted[medianIdx]!];
}

export function initialCamera(input: CamInput): CamResult {
  return computeCamera(input, null, 0);
}

export function computeCamera(input: CamInput, prev: CamState | null, dt: number): CamResult {
  const viewW = input.viewW ?? VIEW_W,
    viewH = input.viewH ?? VIEW_H;
  const active = input.players.filter((p) => p.active);
  let focus: CamPlayer[] = [];
  let median: CamPlayer | undefined;
  if (active.length) {
    const sorted = [...active].sort((a, b) => a.progress - b.progress || a.id - b.id);
    const mi = Math.floor((sorted.length - 1) / 2);
    median = sorted[mi]!;
    focus = sorted.length <= 2 ? sorted : chooseFocus(sorted, mi, viewW, viewH);
  }

  // target framing
  let tcx = prev?.cx ?? input.boundsW / 2,
    tcy = prev?.cy ?? input.boundsH / 2,
    tz = prev?.zoom ?? 1;
  let lead = prev?.lead ?? 0;
  let zone = -1;
  if (focus.length) {
    const xs = focus.map((p) => p.x),
      ys = focus.map((p) => p.y);
    let x0 = Math.min(...xs),
      x1 = Math.max(...xs),
      y0 = Math.min(...ys),
      y1 = Math.max(...ys);
    const pad = input.look ? input.look.padTiles * TILE : FRAME_PAD;
    const hz = input.look?.hazard;
    if (hz) {
      // the hazard joins the frame while the group and the hazard still fit at the minimum zoom
      const hx0 = hz.kind === 'avalanche' ? Math.min(x0, hz.pos) : x0,
        hy1 = hz.kind === 'avalanche' ? y1 : Math.max(y1, hz.pos);
      if (Math.min(viewW / (x1 - hx0 + 2 * pad), viewH / (hy1 - y0 + 2 * pad)) >= ZOOM_MIN) {
        x0 = hx0;
        y1 = hy1;
      }
    }
    tz = clamp(Math.min(viewW / (x1 - x0 + 2 * pad), viewH / (y1 - y0 + 2 * pad)), ZOOM_MIN, ZOOM_MAX);
    tcx = (x0 + x1) / 2;
    tcy = (y0 + y1) / 2;
    const anchor = median && focus.length > 2 ? median : { x: tcx, y: tcy };
    const zones = input.zones ?? [];
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i]!;
      if (anchor.x >= z.x * TILE && anchor.x < (z.x + z.w) * TILE && anchor.y >= z.y * TILE && anchor.y < (z.y + z.h) * TILE) {
        zone = i;
        break;
      }
    }
    if (zone >= 0) {
      const z = zones[zone]!;
      tz = clamp(Math.min(viewW / (z.w * TILE), viewH / (z.h * TILE)), ZOOM_MIN, ZOOM_MAX);
      tcx = (z.x + z.w / 2) * TILE;
      tcy = (z.y + z.h / 2) * TILE;
    } else {
      const gx = input.look?.goalX;
      const dir =
        gx != null ? clamp((gx - tcx) / (6 * TILE), -1, 1) : clamp(focus.reduce((s, p) => s + p.vx, 0) / focus.length / RUN_SPEED, -1, 1); // campaign: toward the goal
      lead += (dir - lead) * (1 - Math.exp(-2.5 * dt));
      tcx += lead * LEAD * (viewW / tz / 2);
    }
  }
  // keep the picture inside the level; a level shorter than the view sits near the bottom of it (sky above, a strip of ground below)
  const fitX = (c: number, bound: number, view: number, z: number) => {
    const half = view / z / 2;
    return bound <= 2 * half ? bound / 2 : clamp(c, half, bound - half);
  };
  const fitY = (c: number, bound: number, view: number, z: number) => {
    const half = view / z / 2;
    return bound <= 2 * half - BOTTOM_STRIP / z ? bound + BOTTOM_STRIP / z - half : clamp(c, half, bound - half + BOTTOM_STRIP / z);
  };

  if (!prev) {
    const state: CamState = { cx: 0, cy: 0, zoom: tz, vcx: 0, vcy: 0, vz: 0, lead };
    state.cx = fitX(tcx, input.boundsW, viewW, tz);
    state.cy = fitY(tcy, input.boundsH, viewH, tz);
    return finish(input, state, focus, median, zone, viewW, viewH);
  }
  const zoomOmega = tz < prev.zoom ? OMEGA_ZOOM_OUT : OMEGA_ZOOM_IN;
  const [zoom, vz] = spring(prev.zoom, prev.vz, tz, zoomOmega, dt);
  const z = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
  const [cx, vcx] = spring(prev.cx, prev.vcx, fitX(tcx, input.boundsW, viewW, z), OMEGA_POS, dt);
  const [cy, vcy] = spring(prev.cy, prev.vcy, fitY(tcy, input.boundsH, viewH, z), OMEGA_POS, dt);
  return finish(input, { cx, cy, zoom: z, vcx, vcy, vz, lead }, focus, median, zone, viewW, viewH);
}

function finish(
  input: CamInput,
  state: CamState,
  focus: CamPlayer[],
  median: CamPlayer | undefined,
  zone: number,
  viewW: number,
  viewH: number,
): CamResult {
  const w = viewW / state.zoom,
    h = viewH / state.zoom;
  const rect: Rect = { x: state.cx - w / 2, y: state.cy - h / 2, w, h };
  const offscreen: Offscreen[] = [];
  for (const p of input.players) {
    if (!p.visibleCheck) continue;
    const m = OFFSCREEN_MARGIN;
    const dx = p.x - state.cx,
      dy = p.y - state.cy;
    const ox = Math.abs(dx) - (w / 2 - m),
      oy = Math.abs(dy) - (h / 2 - m);
    if (ox <= 0 && oy <= 0) continue;
    const len = Math.hypot(dx, dy) || 1;
    offscreen.push({ id: p.id, dirX: dx / len, dirY: dy / len, dist: Math.max(ox, oy) });
  }
  return { state, rect, focus: focus.map((p) => p.id), median: median?.id ?? -1, zone, offscreen };
}

// Where to draw an arrow on the screen border for an off-camera player: intersection of the ray from the centre with the inset rect.
export function arrowPoint(
  dirX: number,
  dirY: number,
  viewW: number,
  viewH: number,
  inset: number,
): { x: number; y: number; angle: number } {
  const hw = viewW / 2 - inset,
    hh = viewH / 2 - inset;
  const t = Math.min(dirX !== 0 ? hw / Math.abs(dirX) : Infinity, dirY !== 0 ? hh / Math.abs(dirY) : Infinity);
  return { x: viewW / 2 + dirX * t, y: viewH / 2 + dirY * t, angle: Math.atan2(dirY, dirX) };
}

// Time each player has spent out of the picture. `limitSec` comes from the difficulty (bubbleSec); returns the ids that reached it.
export class StragglerTracker {
  private t = new Map<number, number>();
  update(dt: number, offscreenIds: Iterable<number>, limitSec: number): number[] {
    const off = new Set(offscreenIds);
    const hit: number[] = [];
    for (const id of off) {
      const v = (this.t.get(id) ?? 0) + dt;
      this.t.set(id, v);
      if (v >= limitSec - 1e-6) hit.push(id); // 120 steps of 1/60 must reach 2 s despite float error
    }
    for (const id of [...this.t.keys()]) if (!off.has(id)) this.t.delete(id);
    return hit;
  }
  seconds(id: number): number {
    return this.t.get(id) ?? 0;
  }
  reset(id: number): void {
    this.t.delete(id);
  }
}

// BFS distance from the goal over every non-solid tile (4-neighbours). Smaller = closer to the goal; it also works in vertical levels.
// Cells the goal cannot reach get 1e6 + manhattan distance, so ordering still makes sense.
export function progressField(grid: TileGrid, goal: Cell): Int32Array {
  const { w, h } = grid;
  const f = new Int32Array(w * h).fill(-1);
  const open = (x: number, y: number) => !isSolidKind(tileAt(grid, x, y)) && tileAt(grid, x, y) !== T.FreeSolid;
  const q: number[] = [];
  const start = goal.y * w + goal.x;
  f[start] = 0;
  q.push(start);
  for (let i = 0; i < q.length; i++) {
    const c = q[i]!,
      x = c % w,
      y = (c / w) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || f[ny * w + nx] !== -1 || !open(nx, ny)) continue;
      f[ny * w + nx] = f[c]! + 1;
      q.push(ny * w + nx);
    }
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (f[y * w + x] === -1) f[y * w + x] = 1_000_000 + Math.abs(x - goal.x) + Math.abs(y - goal.y);
  return f;
}
export function progressAt(f: Int32Array, grid: TileGrid, px: number, py: number): number {
  const x = clamp(Math.floor(px / TILE), 0, grid.w - 1),
    y = clamp(Math.floor(py / TILE), 0, grid.h - 1);
  return f[y * grid.w + x]!;
}
