// The bobbing arrow of the pass window, pointing at it from the open floor beside it. With a rat cave beside the window (HAZARD_V3, map 15) the arrow never sits over the hole.
import type Phaser from 'phaser';
import type { Game, Station } from '../../../sim/overcooked';
import { TILE } from '@pichi/screen-kit/art';

type Place = (scene: Phaser.Scene, key: string, x: number, y: number, k?: number) => Phaser.GameObjects.Image;

const SIDES = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

/** The side of the window that is open floor; null when the only floor beside it is a rat cave. */
function openSide(game: Game, st: Station): [number, number] | null {
  let cave = false;
  for (const [dx, dy] of SIDES) {
    const [x, y] = [st.tx + dx, st.ty + dy];
    if (game.grid[y]?.[x]?.kind !== 'floor') continue;
    if (!game.caves?.at.some((c) => c[0] === x && c[1] === y)) return [dx, dy];
    cave = true;
  }
  return cave ? null : [0, 1];
}

export function windowArrow(
  s: Phaser.Scene,
  game: Game,
  st: Station,
  cx: number,
  cy: number,
  place: Place,
): Phaser.GameObjects.Image | undefined {
  const dir = openSide(game, st);
  if (!dir) return undefined;
  const arrow = place(s, 'arrow', cx + dir[0] * TILE, cy + dir[1] * TILE, 0.8)
    .setRotation(Math.atan2(-dir[1], -dir[0]))
    .setAlpha(0.85)
    .setDepth(2);
  s.tweens.add({
    targets: arrow,
    x: arrow.x - dir[0] * TILE * 0.22,
    y: arrow.y - dir[1] * TILE * 0.22,
    duration: 520,
    yoyo: true,
    repeat: -1,
    ease: 'sine.inOut',
  });
  return arrow;
}
