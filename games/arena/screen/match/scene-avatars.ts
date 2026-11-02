// Manchazo's players as their own avatar in the colour of their team (platform TeamSprite, opt-in): the garment takes orange or blue, the rest of the look is the
// player's own. Over the head a chip with the player's number (white, team outline) tells team mates apart even when their looks resemble each other.
import type Phaser from 'phaser';
import type { Appearance } from '@pichi/core/avatar';
import { TeamSprite } from '@pichi/screen-kit/art/chef';
import { Y0 } from './layout';
import { TEAM_COLOR, feetRing } from './scene-body';

export const LOOK_SCALE = 0.74; // logical px per design unit: a character is about 77 px tall, a tile and a third (56 px tiles): it reads from the couch
const FEET = 20; // the feet sit this far under the body's centre (the torso is on it)
const CHIP_Y = 88; // the chip centre over the feet: clear of the top of the hair, hat or crown
const ROLE = 'arena';

export class Avatars {
  private sprites = new Map<number, TeamSprite>();
  private chips!: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene) {}

  /** Start of a frame: nothing is shown until `show` says so. */
  begin(): void {
    this.chips ??= this.scene.add.graphics().setDepth(30);
    this.chips.clear();
    this.sprites.forEach((s) => s.setVisible(false));
  }

  /** Draws one player at its body's centre (x, y); returns where the number goes. */
  show(g: Phaser.GameObjects.Graphics, slot: number, ap: Appearance, team: number, x: number, y: number, stunned: boolean, trail: boolean) {
    const feet = y + FEET;
    let s = this.sprites.get(slot);
    if (!s) this.sprites.set(slot, (s = new TeamSprite(this.scene, ROLE)));
    feetRing(g, x, feet, team, stunned, trail);
    s.setLook(ap, TEAM_COLOR[team % 2]!)
      .place(x, feet, LOOK_SCALE, stunned ? 0.55 : 1, 1 + feet / 2000)
      .setVisible(true);
    // on the top row the chip would land on the HUD band: it goes beside the head, inside the field
    const high = feet - CHIP_Y < Y0 + 16;
    const cx = high ? x + 26 : x;
    const cy = high ? Y0 + 16 : feet - CHIP_Y;
    this.chips.fillStyle(0xffffff, 1).fillCircle(cx, cy, 15);
    this.chips.lineStyle(5, TEAM_COLOR[team % 2]!, 1).strokeCircle(cx, cy, 15);
    return { x: cx, y: cy };
  }
}
