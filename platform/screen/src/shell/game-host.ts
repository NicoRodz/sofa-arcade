// Hosts the games' Phaser scenes: one Phaser.Game for the page, created with the scenes every registered game declares, and the switch
// between them (the scene of a game sleeps while another one runs). Moved out of apps/screen/src/main.ts (F4b): `showScene('main' | 'obst')` became
// showScene(gameId); the Obstaculos-only steps are the scene's `leave` hook.
import Phaser from 'phaser';
import { C, H, W } from '../art/tokens';
import { flushLag } from '../net/latency';
import { games, type SceneSpec } from './game';

let phaser: Phaser.Game | undefined;
const byGame = new Map<string, SceneSpec[]>();
export const phaserGame = () => phaser!;

export function createPhaser() {
  const specs: SceneSpec[] = [];
  for (const g of games().list()) {
    const mine = g.scenes?.() ?? [];
    byGame.set(g.manifest.id, mine);
    specs.push(...mine);
  }
  phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: C.cocoa,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
    fps: { target: 60 },
    scene: specs.map((s) => s.scene),
  });
  phaser.events.on(Phaser.Core.Events.POST_RENDER, flushLag);
  return phaser;
}

/** Show the scenes of this game: the other games' scenes leave (they are told, then put to sleep), this one wakes (or starts, the first time). */
export function showScene(gameId: string) {
  const sm = phaser!.scene;
  for (const [id, specs] of byGame)
    if (id !== gameId)
      for (const s of specs) {
        if (sm.isActive(s.key) || sm.isSleeping(s.key)) s.leave?.();
        if (sm.isActive(s.key)) sm.sleep(s.key);
      }
  for (const s of byGame.get(gameId) ?? []) {
    if (sm.isSleeping(s.key)) sm.wake(s.key);
    else if (!s.initial && !sm.isActive(s.key)) sm.start(s.key);
  }
}
