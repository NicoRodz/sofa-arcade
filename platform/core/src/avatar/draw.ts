// Single entry point of the avatar art (plan creador-personajes §2-§3). The phone creator and, in F4, the screen rig call this.
// Origin = the feet, y down, design px (chef box 120x170 anchored at (60,150): everything stays inside x in [-60,60], y in [-150,20]).
import type { Appearance } from './appearance';
import type { Painter } from './painter';
import { makeCtx } from './parts/ctx';
import { avatarParts } from './parts/list';

/**
 * Draws one character. `view`: 'front' | 'side' (faces +x; mirror with scale(-1,1) to face left) | 'back'. `t`: seconds, drives idle breathing and the
 * sway of capes, scarves and the ponytail. `slotColor`: identity colour for the ring and the back item. `role`: game id ('pizzas' chef hat + apron,
 * 'obstaculos' helmet + harness + 0.6 back item, 'arena'/undefined keep the player's own look). The role replaces a slot, it never stacks.
 */
export function drawAvatar(
  p: Painter,
  ap: Appearance,
  opts: { view: 'front' | 'side' | 'back'; t: number; slotColor: string; role?: string },
): void {
  const c = makeCtx(ap, opts);
  const bob = -(0.5 + 0.5 * Math.sin(opts.t * 2)) * 1.4;
  for (const part of avatarParts(ap, opts.view, opts.role)) {
    p.save();
    if (part.bob) p.translate(0, bob);
    part.draw(p, c);
    p.restore();
  }
}
export { avatarParts, partsForRig, Z, type AvatarPart } from './parts/list';
