// Free boxes: gravity, landing, pushing.
import { DT, GRAVITY_DOWN_MULT, GRAVITY_UP, MAX_FALL, PLAYER_H, PLAYER_W, TILE } from '../../constants';
import { isHazardKind, isOneWayKind, isSolidKind } from '../../legend';
import { pushRect } from '../world/collide';
import { isActive, type BoxE, type PlayerState, type World } from '../world/state';
import { BOX_SIZE, HEAVY_GRIPS, HOLD_BREAK } from '../world/tuning';
import { boxTouches, tileAt, tileOf, type TileGrid } from '../world/tiles';

// --- boxes
function landBox(g: TileGrid, b: BoxE): void {
  b.vy = Math.min(MAX_FALL, b.vy + GRAVITY_UP * GRAVITY_DOWN_MULT * DT);
  const dy = b.vy * DT;
  const feetOld = b.y + BOX_SIZE,
    feetNew = feetOld + dy;
  let top = Infinity;
  const x0 = tileOf(b.x),
    x1 = tileOf(b.x + BOX_SIZE - 1e-6);
  for (let ty = Math.ceil((feetOld - 0.01) / TILE); ty <= Math.floor(feetNew / TILE); ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const k = tileAt(g, tx, ty);
      if ((isSolidKind(k) || isOneWayKind(k)) && ty * TILE < top) top = ty * TILE;
    }
  }
  if (top !== Infinity) {
    b.y = top - BOX_SIZE;
    b.vy = 0;
    b.grounded = true;
  } else {
    b.y += dy;
    b.grounded = false;
  }
}

export function stepBoxes(w: World, releaseHolder: (p: PlayerState) => void): void {
  for (const b of w.ent.boxes) {
    const x0 = b.x,
      y0 = b.y;
    for (const s of [...b.holders]) {
      const p = w.players.find((q) => q.slot === s);
      const lost =
        !p ||
        !isActive(p) ||
        p.holding?.kind !== 'box' ||
        p.holding.id !== b.id ||
        Math.hypot(p.body.x + PLAYER_W / 2 - (b.x + BOX_SIZE / 2), p.body.y + PLAYER_H / 2 - (b.y + BOX_SIZE / 2)) > HOLD_BREAK;
      if (lost) {
        if (p) releaseHolder(p);
        else b.holders.splice(b.holders.indexOf(s), 1);
      }
    }
    const need = b.heavy ? HEAVY_GRIPS : 1;
    if (b.holders.length >= need) {
      const lead = w.players.find((q) => q.slot === b.holders[0])!;
      const f = lead.body.facing;
      const tx = lead.body.x + PLAYER_W / 2 + f * (PLAYER_W / 2 + BOX_SIZE / 2 + 1) - BOX_SIZE / 2;
      const ty = lead.body.y + PLAYER_H - BOX_SIZE;
      pushRect(w.grid, b, BOX_SIZE, BOX_SIZE, tx - b.x, ty - b.y);
      b.vy = 0;
      b.grounded = true;
    } else if (b.holders.length === 0) {
      landBox(w.grid, b);
    }
    const r = { x: b.x, y: b.y, w: BOX_SIZE, h: BOX_SIZE };
    if (boxTouches(w.grid, r.x + 4, r.y + 4, r.w - 8, r.h - 8, isHazardKind) || b.y > (w.level.h + 1) * TILE) {
      for (const s of [...b.holders]) {
        const p = w.players.find((q) => q.slot === s);
        if (p) releaseHolder(p);
      }
      b.x = b.homeX;
      b.y = b.homeY;
      b.vy = 0;
      b.grounded = false;
      b.holders = [];
    }
    b.dx = b.x - x0;
    b.dy = b.y - y0;
  }
}
