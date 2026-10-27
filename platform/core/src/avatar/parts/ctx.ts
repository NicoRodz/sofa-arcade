import type { Appearance } from '../appearance';
import { HAIR_COLORS, SKIN_TONES } from '../catalog';
import { HATS, ROLE_HATS, clothesSpec, roleSpec, type ClothesSpec, type HatSpec, type RoleSpec } from './data';
import type { View } from './kit';

export interface DrawOpts {
  view: View;
  t: number;
  slotColor: string;
  role?: string;
}
/** Everything a part needs, resolved once per drawAvatar call. Coordinates: design px, origin at the feet, y down (rig-math). */
export interface DrawCtx {
  ap: Appearance;
  view: View;
  t: number;
  slotColor: string;
  role: RoleSpec;
  clothes: ClothesSpec;
  skin: string;
  hair: string;
  hat: HatSpec | null;
  /** Head centre x: the side profile shifts it 3 px toward the facing direction. */
  hx: number;
  /** Slow sway in [-1,1] for capes, scarves and the ponytail. */
  sway: number;
}

export function hatFor(ap: Appearance, role: RoleSpec): HatSpec | null {
  if (role.head === 'chef' || role.head === 'helmet') return ROLE_HATS[role.head]!;
  if (role.head === 'none') return null;
  return HATS[ap.hat] ?? null;
}

export function makeCtx(ap: Appearance, o: DrawOpts): DrawCtx {
  const role = roleSpec(o.role);
  return {
    ap,
    view: o.view,
    t: o.t,
    slotColor: o.slotColor,
    role,
    clothes: clothesSpec(ap.cl),
    skin: SKIN_TONES[ap.sk] ?? SKIN_TONES[1]!,
    hair: HAIR_COLORS[ap.hc] ?? HAIR_COLORS[1]!,
    hat: hatFor(ap, role),
    hx: o.view === 'side' ? 3 : 0,
    sway: Math.sin(o.t * 2.4),
  };
}
