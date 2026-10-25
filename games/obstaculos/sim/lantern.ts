// Lantern and crystals (campaign dynamic 10, plan §4 "Farol (rol)"). The lantern is an item ('l' in the level, like the pickaxe: one player carries it, B hands it to a
// teammate within reach, see sim/pickaxe.ts). A level that has one is DARK (the renderer shows only a circle of CampaignParams.lanternRadiusTiles around the lantern and a
// faint one around each player). Crystals ('Y') are SOLID only while the lantern lights them (centre to centre within the radius): a lit crystal is T.CrystalLit, a dark one
// T.Crystal (walk through it). A crystal never turns solid with a body inside it (it stays dark until the cell is free); one that goes dark lets whoever stood on it fall.
// Dying, a bubble or leaving sends the lantern back where it was found. Inert outside a campaign world.
import { PLAYER_H, PLAYER_W, TILE } from '../constants';
import { T } from '../legend';
import { bodyRect, cellRect, overlaps } from './collide';
import { emit, isActive, type PlayerState, type World } from './state';
import { setTile, tileAt } from './tiles';
import { BOX_SIZE, PICK_TAKE_REACH } from './tuning';

export const ownsLantern = (w: World, slot: number): boolean => w.ent.lanterns.some((k) => k.heldBy === slot);
export const isDark = (w: World): boolean => !!w.camp && w.ent.lanterns.length > 0;

// Take (a free one touched), follow the holder (the light is centred on the holder's body), go home when the holder is out of play.
function stepItems(w: World): void {
  for (const k of w.ent.lanterns) {
    if (k.heldBy < 0) {
      const p = w.players.find(
        (q) =>
          isActive(q) &&
          !ownsLantern(w, q.slot) &&
          Math.abs(q.body.x + PLAYER_W / 2 - k.x) < PLAYER_W / 2 + PICK_TAKE_REACH &&
          Math.abs(q.body.y + PLAYER_H / 2 - k.y) < PLAYER_H / 2 + PICK_TAKE_REACH,
      );
      if (p) {
        k.heldBy = p.slot;
        emit(w, 'obst.lantern', { player: p.slot, action: 'take' });
      }
      continue;
    }
    const p = w.players.find((q) => q.slot === k.heldBy);
    if (!p || !isActive(p)) {
      k.heldBy = -1;
      k.x = k.homeX;
      k.y = k.homeY;
      continue;
    }
    k.x = p.body.x + PLAYER_W / 2;
    k.y = p.body.y - 6;
  }
}

// Where each lantern shines from: the holder's body centre, or the item itself on the floor.
export function lightSources(w: World): { x: number; y: number; holder: number }[] {
  return w.ent.lanterns.map((k) => {
    const p = k.heldBy >= 0 ? w.players.find((q) => q.slot === k.heldBy) : undefined;
    return p ? { x: p.body.x + PLAYER_W / 2, y: p.body.y + PLAYER_H / 2, holder: p.slot } : { x: k.x, y: k.y, holder: -1 };
  });
}

const occupiedCell = (w: World, x: number, y: number): boolean => {
  const r = cellRect(x, y);
  for (const p of w.players) if (p.connected && p.mode !== 'dead' && overlaps(r, bodyRect(p.body))) return true;
  for (const b of w.ent.boxes) if (overlaps(r, { x: b.x, y: b.y, w: BOX_SIZE, h: BOX_SIZE })) return true;
  return false;
};

export function stepLanterns(w: World): void {
  const c = w.camp;
  if (!c || w.ent.lanterns.length === 0) return;
  stepItems(w);
  const src = lightSources(w),
    r2 = (c.lanternRadiusTiles * TILE) ** 2;
  let lit = 0,
    dim = 0,
    by = -1;
  for (const cell of w.ent.crystals) {
    const cx = (cell.x + 0.5) * TILE,
      cy = (cell.y + 0.5) * TILE;
    const s = src.find((q) => (q.x - cx) ** 2 + (q.y - cy) ** 2 <= r2);
    const kind = tileAt(w.grid, cell.x, cell.y);
    if (s && kind === T.Crystal) {
      if (!occupiedCell(w, cell.x, cell.y)) {
        setTile(w.grid, cell.x, cell.y, T.CrystalLit);
        lit++;
        by = s.holder;
      }
    } else if (!s && kind === T.CrystalLit) {
      setTile(w.grid, cell.x, cell.y, T.Crystal);
      dim++;
    }
  }
  if (lit + dim > 0) w.tilesVersion++;
  if (lit > 0) emit(w, 'obst.lantern', { player: by, action: 'light' });
  if (dim > 0) emit(w, 'obst.lantern', { player: -1, action: 'dim' });
}

// B hands the lantern over (sim/pickaxe.ts calls this next to the pickaxe).
export function passLantern(w: World, from: PlayerState, to: PlayerState): boolean {
  let any = false;
  for (const k of w.ent.lanterns)
    if (k.heldBy === from.slot) {
      k.heldBy = to.slot;
      any = true;
    }
  if (any) emit(w, 'obst.lantern', { player: from.slot, action: 'pass' });
  return any;
}

// What the renderer needs of a dark level: the radius of a lantern's circle and where each one shines from (null in a level that is not dark).
export function darkView(w: World): { radius: number; lights: { x: number; y: number }[] } | null {
  return isDark(w) ? { radius: w.camp!.lanternRadiusTiles * TILE, lights: lightSources(w).map((l) => ({ x: l.x, y: l.y })) } : null;
}
