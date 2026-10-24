// Phaser scene for the game: builds the textures, owns one ObstaclesView per running level and calls it every render frame.
// The host (F3) supplies the world: step(dtMs) advances the simulation and sets world.alpha; world() returns the WorldView or null.
import Phaser from 'phaser';
import type { ObstEvents } from '@party/shared/obstaculos';
import type { Emitter } from '@party/shared/events';
import { C } from '../../../art/tokens';
import { ObstaclesView, buildObstacleTextures } from './obstacles-view';
import type { WorldView } from './view';

export interface ObstHost {
  step(deltaMs: number): void; // advance the simulation (fixed 60 Hz inside) and set world.alpha
  world(): WorldView | null;
  afterRender?(view: ObstaclesView): void; // e.g. world.requestBubbles(view.bubbleDue); skip stepping while view.hitstopMs > 0
}

export class ObstaclesScene extends Phaser.Scene {
  view: ObstaclesView | null = null;
  private current: WorldView | null = null;
  private ready = false;
  constructor(private host: ObstHost, private bus?: Emitter<ObstEvents>) { super('obstaculos'); }

  create() {
    buildObstacleTextures(this);
    this.cameras.main.setBackgroundColor(C.cocoa);
    this.ready = true;
  }

  endLevel() { this.view?.destroy(); this.view = null; this.current = null; }

  update(_t: number, delta: number) {
    if (!this.ready) return;
    const w = this.host.world();
    if (w !== this.current) { this.endLevel(); this.current = w; if (w) this.view = new ObstaclesView(this, w, this.bus); }
    if (!w || !this.view) return;
    if (this.view.hitstopMs <= 0) this.host.step(delta);
    this.view.update(delta);
    this.host.afterRender?.(this.view);
  }
}
