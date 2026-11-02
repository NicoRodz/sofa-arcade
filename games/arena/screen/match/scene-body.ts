// One body of Manchazo's scene: grey disc with the team ring (a second ring on blue), a dashed spin of splashes while stained, a thin trail ring on footprints.
import type Phaser from 'phaser';

export const TEAM_COLOR = [0xe69f00, 0x0072b2]; // orange / blue (colour-blind safe pair)
const PX = 56;

export function bodyOutline(g: Phaser.GameObjects.Graphics, x: number, y: number, team: number, stunned: boolean, trail: boolean) {
  g.fillStyle(0x000000, 0.3).fillCircle(x + 3, y + 5, PX * 0.42);
  g.fillStyle(stunned ? 0x6a6a6a : 0xa8a8a8, 1).fillCircle(x, y, PX * 0.4);
  g.lineStyle(6, TEAM_COLOR[team % 2]!, 1).strokeCircle(x, y, PX * 0.4);
  if (team % 2 === 1) g.lineStyle(3, 0xffffff, 1).strokeCircle(x, y, PX * 0.26); // the team is not told by colour alone
  if (stunned)
    g.lineStyle(5, TEAM_COLOR[(team + 1) % 2]!, 1).strokeCircle(x, y, PX * 0.55); // stained: the rival's colour around it
  else if (trail) g.lineStyle(3, TEAM_COLOR[(team + 1) % 2]!, 0.8).strokeCircle(x, y, PX * 0.5);
}
