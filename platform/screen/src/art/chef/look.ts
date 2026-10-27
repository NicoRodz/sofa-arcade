// A player's Appearance on the chef rig (creator F4): the rigid parts of avatarParts/partsForRig are baked once per (look, role) into the
// rig's own sprite slots (same 120x170 box, feet at (60,150)); the rig keeps animating them (squash, walk, chop) and its own eyes, mouth,
// ring and name plate. A player without `ap` never gets here: the rig keeps the slot textures it was built with.
import type Phaser from 'phaser';
import type { Appearance } from '@pichi/core/avatar/appearance';
import { Canvas2DPainter } from '@pichi/core/avatar/canvas2d-painter';
import { encodeAppearance } from '@pichi/core/avatar/codec';
import { SKIN_TONES } from '@pichi/core/avatar/catalog';
import { avatarParts } from '@pichi/core/avatar/draw';
import { makeCtx } from '@pichi/core/avatar/parts/ctx';
import { drawArm } from '../chefdraw';
import { makeTex, type Ctx } from '../gfx';

const BOX = { w: 120, h: 170, ox: 60, oy: 150 };

export interface LookKeys {
  torsoF: string;
  torsoB: string;
  headF: string; // head + back hair, under the rig's eyes and mouth
  headB: string; // everything seen from behind
  over: string; // glasses + front hair: over the eyes
  hat: string;
  arm: string;
}

/** Which avatar parts land in which rig sprite. The face (eyes, mouth) is the rig's, so it is never baked. */
const SLOTS = {
  torsoF: { view: 'front', ids: ['back', 'legs', 'torso', 'overlay', 'back-front'] },
  torsoB: { view: 'back', ids: ['back', 'legs', 'torso', 'overlay', 'back-front'] },
  headF: { view: 'front', ids: ['hair-back', 'head'] },
  headB: { view: 'back', ids: ['hair-back', 'head', 'hair-front', 'hat'] },
  over: { view: 'front', ids: ['glasses', 'hair-front'] },
  hat: { view: 'front', ids: ['hat'] },
} as const;

function bake(ap: Appearance, role: string, slot: keyof typeof SLOTS) {
  const { view, ids } = SLOTS[slot];
  return (c: Ctx) => {
    const p = new Canvas2DPainter(c);
    const ctx = makeCtx(ap, { view, t: 0, slotColor: '#ffffff', role });
    for (const part of avatarParts(ap, view, role)) {
      if (!(ids as readonly string[]).includes(part.id)) continue;
      p.save();
      part.draw(p, ctx);
      p.restore();
    }
  };
}

/** Builds (once per look and role, cached in the scene's texture manager) the textures a rig needs and returns their keys. */
export function lookTextures(scene: Phaser.Scene, ap: Appearance, role: string): LookKeys {
  const id = `${encodeAppearance(ap)}_${role}`;
  const key = (s: string) => `look_${id}_${s}`;
  for (const s of Object.keys(SLOTS) as (keyof typeof SLOTS)[]) makeTex(scene, key(s), BOX, bake(ap, role, s));
  const arm = `look_arm_${ap.sk}`;
  makeTex(scene, arm, { w: 24, h: 48, ox: 12, oy: 9 }, (c) => drawArm(new Canvas2DPainter(c), SKIN_TONES[ap.sk] ?? SKIN_TONES[1]!));
  return { torsoF: key('torsoF'), torsoB: key('torsoB'), headF: key('headF'), headB: key('headB'), over: key('over'), hat: key('hat'), arm };
}
