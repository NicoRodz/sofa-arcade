// The ordered part list (plan §2 "Capas de dibujo") and the rig contract. `avatarParts` is pure: it only decides WHICH parts exist and in what z order.
import type { Appearance } from '../appearance';
import type { Painter } from '../painter';
import { drawBack, drawBackFront } from './backs';
import { drawArm, drawFace, drawHead, drawLegs, drawRing, drawTorso } from './body';
import { hatFor, type DrawCtx } from './ctx';
import { roleSpec } from './data';
import { drawGlasses } from './glasses';
import { drawHairBack, drawHairFront } from './hair';
import { drawHat } from './hats';
import type { View } from './kit';
import { drawOverlay } from './role';

/** z of each layer, back to front. In the back view the cape/back item and hair move AFTER the role overlay and both arms sit above them. */
export const Z = {
  ring: 10,
  back: 20,
  hairBack: 30,
  armBack: 40,
  legs: 50,
  torso: 60,
  overlay: 70,
  backOver: 75,
  backFront: 80,
  armsBackView: 85,
  head: 90,
  face: 100,
  glasses: 110,
  hairFront: 120,
  hat: 130,
  armFront: 140,
} as const;

export interface AvatarPart {
  id: string;
  z: number;
  /** Rises and falls with the idle breathing (everything above the hips). */
  bob: boolean;
  draw: (p: Painter, c: DrawCtx) => void;
}

export function avatarParts(ap: Appearance, view: View, role?: string): AvatarPart[] {
  const r = roleSpec(role);
  const back = view === 'back';
  const out: AvatarPart[] = [];
  const add = (id: string, z: number, bob: boolean, draw: AvatarPart['draw']) => out.push({ id, z, bob, draw });
  add('ring', Z.ring, false, drawRing);
  if (ap.bk > 0) add('back', back ? Z.backOver : Z.back, true, drawBack);
  if (view !== 'back' && ap.s !== 0) add('hair-back', Z.hairBack, true, drawHairBack);
  add('arm-back', back ? Z.armsBackView : Z.armBack, true, (p, c) => drawArm(p, c, -1, view !== 'front'));
  add('legs', Z.legs, false, drawLegs);
  add('torso', Z.torso, true, drawTorso);
  if (r.overlay !== 'none') add('overlay', Z.overlay, true, drawOverlay);
  if (ap.bk === 3 || (ap.bk === 5 && !back)) add('back-front', Z.backFront, true, drawBackFront);
  add('head', Z.head, true, drawHead);
  if (!back) add('face', Z.face, true, drawFace);
  if (!back && ap.gl > 0) add('glasses', Z.glasses, true, drawGlasses);
  add('hair-front', Z.hairFront, true, drawHairFront);
  if (hatFor(ap, r)) add('hat', Z.hat, true, drawHat);
  add('arm-front', back ? Z.armsBackView + 1 : Z.armFront, true, (p, c) => drawArm(p, c, 1, false));
  return out.sort((a, b) => a.z - b.z);
}

/**
 * RIG CONTRACT (phase F4 integrates it; nothing in platform/screen uses it yet). Maps each rig bone of platform/screen/src/art/chef/rig.ts
 * to the part ids that hang from it, so the Phaser rig can bake rigid parts once per appearance (head: hat, glasses, front hair) and
 * redraw only the moving ones (back item, legs, skirt). Same z order as `avatarParts`; the rig keeps its own bone containers.
 */
export function partsForRig(ap: Appearance, view: View, role?: string): Record<'root' | 'feet' | 'torso' | 'arms' | 'head', string[]> {
  const bone: Record<string, 'root' | 'feet' | 'torso' | 'arms' | 'head'> = {
    ring: 'root',
    legs: 'feet',
    back: 'torso',
    torso: 'torso',
    overlay: 'torso',
    'back-front': 'torso',
    'arm-back': 'arms',
    'arm-front': 'arms',
    head: 'head',
    face: 'head',
    glasses: 'head',
    'hair-back': 'head',
    'hair-front': 'head',
    hat: 'head',
  };
  const res = { root: [] as string[], feet: [] as string[], torso: [] as string[], arms: [] as string[], head: [] as string[] };
  for (const part of avatarParts(ap, view, role)) res[bone[part.id]!].push(part.id);
  return res;
}
