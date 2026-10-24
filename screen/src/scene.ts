import Phaser from 'phaser';
import type { Game } from '@party/shared/game';
import type { PublicPlayer } from '@party/shared';
import { gameBus } from './bus';
import { C } from './art/tokens';
import { buildChefTextures } from './art/chef';
import { buildFoodTextures } from './art/food';
import { buildFxTextures } from './art/fx';
import { World } from './art/world';
import type { RoundView } from './art/hud';
import { buildPuestoIcons, type PuestoView } from './art/puestos';

export interface Host {
  step(deltaMs: number): void; // advances the game logic
  players(): Map<number, PublicPlayer>;
  puestos(): Map<number, PuestoView>; // suggested stations of the round, by player id
}

export class MainScene extends Phaser.Scene {
  private world: World | null = null;
  private pending: { game: Game; mapId: string; seed: number; view?: RoundView } | null = null;
  constructor(private host: Host) { super('main'); }

  create() {
    buildFoodTextures(this);
    buildChefTextures(this);
    buildFxTextures(this);
    buildPuestoIcons(this);
    this.cameras.main.setBackgroundColor(C.cocoa);
    if (this.pending) { const p = this.pending; this.pending = null; this.startRound(p.game, p.mapId, p.seed, p.view); }
  }

  startRound(game: Game, mapId: string, seed: number, view?: RoundView) {
    if (!this.sys.isActive() || !this.textures.exists('chef_shadow')) { this.pending = { game, mapId, seed, view }; return; }
    this.endRound();
    this.world = new World(this, game, () => this.host.players(), () => this.host.puestos(), gameBus, mapId, seed, view);
  }
  endRound() { this.world?.destroy(); this.world = null; }

  update(_t: number, delta: number) {
    this.host.step(delta);
    this.world?.update(delta);
  }
}
