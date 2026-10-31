// The per-frame dispatch of the shell: the active game (config.game) gets `frame`, nobody else does. Phaser's STEP event calls it (game-host.ts),
// just before the scenes update, so a game's logic advances right before its scene draws it (it was the scene's own update before F4c).
// `activate` runs once whenever the active game is not the one of the last frame (and on the very first frame).
import type { ScreenGame } from './game';
import { activeGame } from './app-state';

let last: ScreenGame | undefined;

export function runFrame(deltaMs: number) {
  const g = activeGame();
  if (g !== last) {
    last = g;
    g.activate?.();
  }
  g.frame?.(deltaMs);
}
