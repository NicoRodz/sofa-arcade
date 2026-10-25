import Phaser from 'phaser';
import type { Game } from '../sim/overcooked';
import type { PublicPlayer } from '@pichi/core';
import { gameBus } from '@pichi/screen-kit/bus';
import { C } from '@pichi/screen-kit/art/tokens';
import { buildChefTextures } from '@pichi/screen-kit/art/chef';
import { buildFoodTextures } from './art/food';
import { Fx, buildFxTextures } from '@pichi/screen-kit/art/fx';
import { World } from './art/world';
import { MutateView } from './art/mutate/mutate-view';
import type { RoundView } from './art/hud';
import { buildPuestoIcons, type PuestoView } from './art/puestos';
import { buildEventTextures } from './art/events';

export interface Host {
  step(deltaMs: number): void; // advances the game logic
  players(): Map<number, PublicPlayer>;
  puestos(): Map<number, PuestoView>; // suggested stations of the round, by player id
}

export class MainScene extends Phaser.Scene {
  private world: World | null = null;
  private pending: { game: Game; mapId: string; seed: number; view?: RoundView } | null = null;
  constructor(private host: Host) {
    super('main');
  }

  create() {
    buildFoodTextures(this);
    buildChefTextures(this);
    buildFxTextures(this);
    buildPuestoIcons(this);
    buildEventTextures(this);
    this.cameras.main.setBackgroundColor(C.cocoa);
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      this.startRound(p.game, p.mapId, p.seed, p.view);
    }
  }

  startRound(game: Game, mapId: string, seed: number, view?: RoundView) {
    if (!this.sys.isActive() || !this.textures.exists('chef_shadow')) {
      this.pending = { game, mapId, seed, view };
      return;
    }
    this.endRound();
    this.world = new World(
      this,
      game,
      () => this.host.players(),
      () => this.host.puestos(),
      gameBus,
      mapId,
      seed,
      view,
    );
    if (game.mut) new MutateView(this, game, new Fx(this), gameBus); // the kitchen that mutates: banner, alarm outline, flash (self-managed, goes with the round)
  }
  endRound() {
    this.world?.destroy();
    this.world = null;
  }

  update(_t: number, delta: number) {
    this.host.step(delta);
    this.world?.update(delta);
  }
}
