// ObstaclesView, layer 1: the layers, sub-views and cameras built in the constructor, and destroy(). (Layers: base -> events -> view.)
import type Phaser from 'phaser';
import { TILE } from '../../../index';
import type { AllObstEvents } from '../../../index';
import type { Emitter } from '@pichi/core';
import { C, H, W } from '@pichi/screen-kit/art';
import { PALETTES } from '../biome';
import { Background } from '../parallax';
import { TileLayer } from '../tiles';
import { RopeDrawer } from '../rope';
import { EntityLayer, HintSigns } from '../entities';
import type { Explorer } from '../rig';
import { ObstHud } from '../hud/hud';
import { ObstFx } from '../fx/fx';
import { DarkLayer } from '../dark';
import { StragglerTracker, progressField, type CamResult, type CamState } from '../camera';
import type { WorldView } from '../view';

export abstract class ObstaclesViewBase {
  readonly camera: { result: CamResult | null } = { result: null };
  readonly stragglers = new StragglerTracker();
  bubbleDue: number[] = []; // ids that stayed out of the picture for DIFFICULTY_PARAMS[...].bubbleSec: the world turns them into bubbles
  hitstopMs = 0; // > 0 right after a death: the host may skip simulation steps (visuals are frozen meanwhile)
  readonly feet = new Map<number, { x: number; y: number }>(); // interpolated feet centre per player, world px

  protected layers: Phaser.GameObjects.Layer[] = [];
  protected hudLayer: Phaser.GameObjects.Layer;
  protected uiCam: Phaser.Cameras.Scene2D.Camera;
  protected bg: Background;
  protected tiles: TileLayer;
  protected rope: RopeDrawer;
  protected ents: EntityLayer;
  protected hints: HintSigns;
  protected fx: ObstFx;
  protected dark: DarkLayer;
  protected hud: ObstHud;
  protected explorers = new Map<number, Explorer>();
  protected field: Int32Array;
  protected camState: CamState | null = null;
  protected off: (() => void)[] = [];
  protected t = 0;
  protected prevInGoal = new Set<number>();
  protected windAcc = 0;
  protected windN = 0;
  protected lastLight = -9;

  constructor(
    protected scene: Phaser.Scene,
    protected world: WorldView,
    bus?: Emitter<AllObstEvents>,
  ) {
    const mkLayer = () => {
      const l = scene.add.layer();
      this.layers.push(l);
      return l;
    };
    const lSky = mkLayer(),
      lOutside = mkLayer(),
      lRope = mkLayer(),
      lTiles = mkLayer(),
      lBehind = mkLayer(),
      lEnt = mkLayer(),
      lPlayers = mkLayer(),
      lLiquid = mkLayer(),
      lDark = mkLayer(),
      lFx = mkLayer();
    this.hudLayer = scene.add.layer().setDepth(10);
    const def = world.level.def;
    this.bg = new Background(scene, lSky, lOutside, def.biome, world.grid.w * TILE, world.grid.h * TILE);
    this.tiles = new TileLayer(scene, lTiles, lLiquid, world.grid, def.biome);
    this.rope = new RopeDrawer(scene, lRope);
    this.ents = new EntityLayer(scene, lEnt, lBehind, def.biome);
    this.hints = new HintSigns(scene, lEnt, def.hints ?? []);
    this.dark = new DarkLayer(scene, lDark);
    this.fx = new ObstFx(scene, lFx);
    this.explorerLayer = lPlayers;
    this.hud = new ObstHud(scene, this.hudLayer, world);
    // two cameras: the main one follows the group (zoom), the second one only draws the HUD
    this.uiCam = scene.cameras.add(0, 0, W, H);
    scene.cameras.main.ignore(this.hudLayer);
    this.uiCam.ignore(this.layers);
    this.field = progressField(world.grid, world.level.markers.goal[0] ?? { x: world.grid.w - 2, y: 1 });
    if (bus) this.wire(bus);
    void C;
    void PALETTES;
  }
  protected explorerLayer: Phaser.GameObjects.Layer;

  protected abstract wire(bus: Emitter<AllObstEvents>): void;

  destroy(): void {
    for (const f of this.off) f();
    this.off = [];
    for (const e of this.explorers.values()) e.destroy();
    this.explorers.clear();
    this.hud.destroy();
    this.dark.destroy();
    this.fx.destroy();
    this.hints.destroy();
    this.ents.destroy();
    this.rope.destroy();
    this.tiles.destroy();
    this.bg.destroy();
    for (const l of this.layers) l.destroy();
    this.hudLayer.destroy();
    const cam = this.scene.cameras.main;
    cam.setZoom(1);
    cam.setScroll(0, 0);
    this.scene.cameras.remove(this.uiCam);
  }
}
