// Team look, step 3 (Phaser): an avatar of a player's own Appearance dressed in the colour of the player's TEAM. Opt-in: nothing here runs until a game builds
// a TeamSprite, so the games that never do (Pizzas, Obstaculos) pay nothing. The textures are baked lazily, once per (look, role, view) in the scene's texture
// manager (team-bake.ts); the team is only the MULTIPLY tint of the garment image, so a look in both teams shares its textures and a team costs no texture.
import type Phaser from 'phaser';
import type { Appearance } from '@pichi/core/avatar';
import { encodeAppearance } from '@pichi/core/avatar';
import { R } from '../gfx';
import type { LookView } from './look-layers';
import { LOOK_BOX, bakeTeamLayers } from './team-bake';

const MULTIPLY = 0; // Phaser.TintModes.MULTIPLY (a type-only import of Phaser keeps this barrel loadable without it)

export interface TeamLookKeys {
  garment: string;
  body: string;
}

/** The texture keys of a look; bakes the two layers the first time (and only then). */
export function teamLookTextures(scene: Phaser.Scene, ap: Appearance, role: string, view: LookView = 'front'): TeamLookKeys {
  const id = `${encodeAppearance(ap)}_${role}_${view}`;
  const keys = { garment: `team_${id}_g`, body: `team_${id}_b` };
  if (scene.textures.exists(keys.garment) && scene.textures.exists(keys.body)) return keys;
  const layers = bakeTeamLayers(ap, view, role);
  if (!scene.textures.exists(keys.garment)) scene.textures.addCanvas(keys.garment, layers.garment);
  if (!scene.textures.exists(keys.body)) scene.textures.addCanvas(keys.body, layers.body);
  return keys;
}

/** The two images of one figure: the garment (grey, tinted with the team colour, MULTIPLY set explicitly: Phaser 4 has more modes) under the body (untinted). */
export class TeamSprite {
  private readonly garment: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Image;
  private id = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly role: string,
    private readonly view: LookView = 'front',
  ) {
    const at = () =>
      scene.add
        .image(0, 0, '__DEFAULT')
        .setOrigin(LOOK_BOX.ox / LOOK_BOX.w, LOOK_BOX.oy / LOOK_BOX.h)
        .setVisible(false);
    this.garment = at().setTintMode(MULTIPLY);
    this.body = at();
  }

  /** Dresses the figure; rebuilds only when the look or the team colour changes. `teamColor` is a Phaser colour number (0xRRGGBB). */
  setLook(ap: Appearance, teamColor: number): this {
    const id = `${encodeAppearance(ap)}|${teamColor}`;
    if (id === this.id) return this;
    this.id = id;
    const keys = teamLookTextures(this.scene, ap, this.role, this.view);
    this.garment.setTexture(keys.garment).setTint(teamColor);
    this.body.setTexture(keys.body);
    return this;
  }

  /** The feet at (x, y); `scale` in logical px per design unit. */
  place(x: number, y: number, scale: number, alpha: number, depth: number): this {
    for (const im of [this.garment, this.body])
      im.setPosition(x, y)
        .setScale(scale / R)
        .setAlpha(alpha)
        .setDepth(depth);
    return this;
  }

  setVisible(v: boolean): this {
    this.garment.setVisible(v);
    this.body.setVisible(v);
    return this;
  }

  destroy(): void {
    this.garment.destroy();
    this.body.destroy();
  }
}
