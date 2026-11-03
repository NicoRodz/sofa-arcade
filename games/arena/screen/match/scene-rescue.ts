// Manchazo's scene, Rescue and Loot layer (PR3): the ring that fills while a teammate frees a stained body, the glow of a rescue, and the cards lying on the floor
// (dimmed with a lock while their owner cannot pick them up, blinking in their last second). No logic: it reads the sim's state.
import { drawIcon, CARD_COLOR } from '../art/glyphs';
import { TEAM_COLOR } from './scene-body';
import { onTop, type Frame } from './scene-frame';
import { LOOT_LOCK_TICKS, LOOT_TICKS, RESCUE_GLOW_TICKS, RESCUE_TICKS, type ManchazoState } from '../../sim';

const BLINK_TICKS = 60;

/** The cards on the floor: icon on a team-neutral plate, a ring that drains over the card's life, a padlock ring while the owner is locked out. */
export function drawLoot(f: Frame, s: ManchazoState) {
  const r = s.match.res;
  if (!r) return;
  const g = onTop(f).g;
  for (const l of r.loot) {
    const left = LOOT_TICKS - l.age;
    if (left < BLINK_TICKS && Math.floor(s.grid.tick / 5) % 2 === 0) continue; // about to go back to its spawner
    const cx = f.x0 + l.x * f.px + f.px / 2;
    const cy = f.y0 + l.y * f.px + f.px / 2;
    const locked = l.age < LOCK;
    const bob = Math.sin((s.grid.tick + l.x * 7) / 8) * 3;
    g.fillStyle(0x000000, 0.25).fillEllipse(cx, cy + f.px * 0.34, f.px * 0.55, f.px * 0.15);
    g.fillStyle(0xfff4d6, locked ? 0.55 : 0.95).fillCircle(cx, cy + bob, f.px * 0.58);
    g.lineStyle(7, CARD_COLOR[l.kind], 1).strokeCircle(cx, cy + bob, f.px * 0.58);
    g.beginPath()
      .lineStyle(6, 0xffffff, 0.9)
      .arc(cx, cy + bob, f.px * 0.92, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * left) / LOOT_TICKS, false)
      .strokePath();
    drawIcon(g, l.kind, cx, cy + bob, f.px * 0.4, s.grid.tick / 8);
    if (locked) {
      const own = TEAM_COLOR[s.grid.bodies[l.owner]!.team % 2]!; // the colour of the one who lost it: it cannot take it back yet
      g.lineStyle(4, own, 0.9).strokeCircle(cx, cy + bob, f.px * 0.66);
      g.fillStyle(own, 0.9).fillRoundedRect(cx - 8, cy + bob + f.px * 0.1, 16, 12, 3);
      g.lineStyle(3, own, 0.9).strokeCircle(cx, cy + bob + f.px * 0.1, 6);
    }
  }
}
const LOCK = LOOT_LOCK_TICKS;

/** Over a body at (x, y) in pixels: the rescue ring while a teammate is freeing it, and the glow of a rescue that just happened (the freed body and its rescuers). */
export function drawRescue(f: Frame, s: ManchazoState, i: number, x: number, y: number) {
  const r = s.match.res;
  if (!r) return;
  const g = onTop(f).g;
  const col = TEAM_COLOR[s.grid.bodies[i]!.team % 2]!;
  const c = r.contact[i]!;
  if (c > 0 && s.match.bodies[i]!.stun > 0) {
    const t = c / RESCUE_TICKS;
    g.lineStyle(14, 0x24160f, 0.6).strokeCircle(x, y, f.px * 0.92);
    g.beginPath()
      .lineStyle(11, 0xffffff, 1)
      .arc(x, y, f.px * 0.92, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t, false)
      .strokePath();
    g.lineStyle(4, col, 1).strokeCircle(x, y, f.px * 1.02);
  }
  const glow = r.glow[i]!;
  if (glow > 0) {
    const t = 1 - glow / RESCUE_GLOW_TICKS;
    g.fillStyle(0xffffff, 0.35 * (1 - t)).fillCircle(x, y, f.px * (0.5 + 0.7 * t));
    g.lineStyle(6, 0xffe066, 1 - t).strokeCircle(x, y, f.px * (0.55 + 0.9 * t));
    g.lineStyle(4, col, 1 - t).strokeCircle(x, y, f.px * (0.45 + 0.6 * t));
  }
}
