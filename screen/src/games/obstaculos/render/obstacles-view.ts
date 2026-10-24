// One level on screen: background, tiles, rope, entities, explorers, fx, shared camera and HUD, drawn from a WorldView.
// The host calls update(dtMs) once per render frame after stepping the world and setting world.alpha. See render/README in view.ts.
import Phaser from 'phaser';
import { PLAYER_H, PLAYER_W, ROPE_LEN, TILE, DIFFICULTY_PARAMS, BUBBLE_POP_SEC, isSolidKind, tileAt } from '@party/shared/obstaculos';
import type { ObstEvents } from '@party/shared/obstaculos';
import type { Emitter } from '@party/shared/events';
import { C, CHEFS, H, W, hexNum } from '../../../art/tokens';
import { buildFxTextures } from '../../../art/fx';
import { PALETTES } from './biome';
import { Background } from './parallax';
import { TileLayer } from './tiles';
import { RopeDrawer, type Anchor } from './rope';
import { EntityLayer, HintSigns, buildEntityTextures } from './entities';
import { Explorer, buildRigTextures } from './rig';
import { ObstHud, medalFor, clockText } from './hud';
import { ObstFx } from './fx';
import { StragglerTracker, VIEW_H, VIEW_W, computeCamera, progressAt, progressField, type CamPlayer, type CamResult, type CamState } from './camera';
import type { EntityView, PlayerView, WorldView } from './view';

export function buildObstacleTextures(scene: Phaser.Scene): void {
  buildFxTextures(scene);
  buildRigTextures(scene);
  buildEntityTextures(scene);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const HIT_STOP_MS = 50;

export class ObstaclesView {
  readonly camera: { result: CamResult | null } = { result: null };
  readonly stragglers = new StragglerTracker();
  bubbleDue: number[] = []; // ids that stayed out of the picture for DIFFICULTY_PARAMS[...].bubbleSec: the world turns them into bubbles
  hitstopMs = 0; // > 0 right after a death: the host may skip simulation steps (visuals are frozen meanwhile)
  readonly feet = new Map<number, { x: number; y: number }>(); // interpolated feet centre per player, world px

  private layers: Phaser.GameObjects.Layer[] = [];
  private hudLayer: Phaser.GameObjects.Layer;
  private uiCam: Phaser.Cameras.Scene2D.Camera;
  private bg: Background;
  private tiles: TileLayer;
  private rope: RopeDrawer;
  private ents: EntityLayer;
  private hints: HintSigns;
  private fx: ObstFx;
  private hud: ObstHud;
  private explorers = new Map<number, Explorer>();
  private field: Int32Array;
  private camState: CamState | null = null;
  private off: (() => void)[] = [];
  private t = 0;
  private prevInGoal = new Set<number>();

  constructor(private scene: Phaser.Scene, private world: WorldView, bus?: Emitter<ObstEvents>) {
    const mkLayer = () => { const l = scene.add.layer(); this.layers.push(l); return l; };
    const lSky = mkLayer(), lOutside = mkLayer(), lRope = mkLayer(), lTiles = mkLayer(), lBehind = mkLayer(), lEnt = mkLayer(), lPlayers = mkLayer(), lLiquid = mkLayer(), lFx = mkLayer();
    this.hudLayer = scene.add.layer().setDepth(10);
    const def = world.level.def;
    this.bg = new Background(scene, lSky, lOutside, def.biome, world.grid.w * TILE, world.grid.h * TILE);
    this.tiles = new TileLayer(scene, lTiles, lLiquid, world.grid, def.biome);
    this.rope = new RopeDrawer(scene, lRope);
    this.ents = new EntityLayer(scene, lEnt, lBehind, def.biome);
    this.hints = new HintSigns(scene, lEnt, def.hints ?? []);
    this.fx = new ObstFx(scene, lFx);
    this.explorerLayer = lPlayers;
    this.hud = new ObstHud(scene, this.hudLayer, world);
    // two cameras: the main one follows the group (zoom), the second one only draws the HUD
    this.uiCam = scene.cameras.add(0, 0, W, H);
    scene.cameras.main.ignore(this.hudLayer);
    this.uiCam.ignore(this.layers);
    this.field = progressField(world.grid, world.level.markers.goal[0] ?? { x: world.grid.w - 2, y: 1 });
    if (bus) this.wire(bus);
    void C; void PALETTES;
  }
  private explorerLayer: Phaser.GameObjects.Layer;

  // ---- events -> juice
  private wire(bus: Emitter<ObstEvents>) {
    const on = <K extends keyof ObstEvents>(k: K, fn: (p: ObstEvents[K]) => void) => this.off.push(bus.on(k, fn));
    const feet = (id: number) => this.feet.get(id) ?? { x: 0, y: 0 };
    const mid = (id: number) => { const f = feet(id); return { x: f.x, y: f.y - PLAYER_H / 2 }; };
    const slotOf = (id: number) => this.world.players.find((p) => p.id === id)?.slot ?? 0;
    const col = (id: number) => hexNum(CHEFS[slotOf(id) % 8]!.color);
    const ent = (id: string): EntityView | undefined => this.world.entities.find((e) => e.id === id);
    on('obst.jump', (e) => {
      const f = feet(e.player);
      this.fx.puff(f.x, f.y, e.kind === 'trampoline' ? 10 : 4);
      this.explorers.get(e.player)?.stretch(e.kind === 'trampoline' ? 1.4 : 1);
      if (e.kind === 'trampoline' || e.kind === 'rope') this.fx.ring(f.x, f.y, col(e.player), 0.3, 1.2);
    });
    on('obst.land', (e) => {
      const f = feet(e.player), k = Math.min(1, e.impact / 800);
      this.fx.puff(f.x, f.y, 2 + Math.round(k * 6));
      if (e.impact > 820) this.fx.shake(90, 0.0016);
    });
    on('obst.ropeTaut', (e) => { const l = this.world.ropes.find((r) => r.id === e.rope)?.links[e.link]; if (l) { this.rope.twang(l.a, l.b); const a = mid(l.a), b = mid(l.b); this.fx.spark((a.x + b.x) / 2, (a.y + b.y) / 2, 3); } });
    on('obst.ropeStrain', (e) => { const l = this.world.ropes.find((r) => r.id === e.rope)?.links[e.link]; if (l) { const a = mid(l.a), b = mid(l.b); this.fx.spark((a.x + b.x) / 2, (a.y + b.y) / 2, 6); this.fx.shake(70, 0.0012); } });
    on('obst.grab', (e) => { const m = mid(e.player); this.fx.ring(m.x, m.y - 6, 0xffffff, 0.3, 1.0); });
    on('obst.throw', (e) => { const m = mid(e.player); this.fx.ring(m.x, m.y - 10, 0xffd23f, 0.3, 1.4); this.fx.float(m.x, m.y - 50, '¡Lanzado!', C.cheese, 26); });
    on('obst.handCatch', (e) => { const m = mid(e.target); this.fx.ring(m.x, m.y, 0x3fa34d, 0.3, 1.5); this.fx.float(m.x, m.y - 48, '¡Mano!', '#7BE08A', 28); });
    on('obst.death', (e) => {
      const m = mid(e.player);
      this.hitstopMs = HIT_STOP_MS;
      this.fx.burst(m.x, m.y, slotOf(e.player), 18);
      this.fx.shake(220, 0.006);
      this.explorers.get(e.player)?.fail();
    });
    on('obst.bubble', (e) => { const m = mid(e.player); this.fx.ring(m.x, m.y, 0x9be0ff, 0.5, 2); this.fx.float(m.x, m.y - 54, '¡Burbuja!', '#9BE0FF', 28); this.stragglers.reset(e.player); });
    on('obst.respawn', (e) => { const m = mid(e.player); this.fx.ring(m.x, m.y, col(e.player), 0.3, 1.6); this.fx.starBurst(m.x, m.y, 5); });
    on('obst.checkpoint', (e) => {
      const p = this.world.level.markers.checkpoint[e.index]; if (!p) return;
      const x = (p.x + 0.5) * TILE, y = (p.y + 0.3) * TILE;
      this.fx.ring(x, y, 0xffc93c, 0.4, 2.2); this.fx.starBurst(x, y - 40, 8); this.fx.float(x, y - 90, '¡Checkpoint!', C.cheese, 34);
    });
    on('obst.star', (e) => {
      const p = this.world.level.markers.star[e.index]; if (!p) return;
      const x = (p.x + 0.5) * TILE, y = (p.y + 0.5) * TILE;
      this.fx.starBurst(x, y, 8); this.fx.ring(x, y, 0xffd23f, 0.3, 1.5); this.fx.float(x, y - 30, e.streak > 1 ? `¡Estrella x${e.streak}!` : '¡Estrella!', C.cheese, 28);
    });
    on('obst.plate', (e) => { const p = ent(e.id); if (p) this.fx.puff(p.x + p.w / 2, p.y + p.h - 4, 3); });
    on('obst.gate', (e) => { const p = ent(e.id); if (p) { this.fx.puff(p.x + p.w / 2, p.y + p.h / 2, 6); this.fx.shake(120, 0.002); } });
    on('obst.goalEnter', (e) => {
      const g = this.world.level.markers.goal[0]; const m = mid(e.player);
      this.explorers.get(e.player)?.celebrate();
      this.fx.confettiAt(g ? (g.x + 0.5) * TILE : m.x, g ? g.y * TILE : m.y, 14);
      this.fx.float(m.x, m.y - 56, `${e.inside}/${e.total}`, C.cream, 30);
    });
    on('obst.levelClear', (e) => {
      const g = this.world.level.markers.goal[0]; const x = g ? (g.x + 0.5) * TILE : 0, y = g ? g.y * TILE : 0;
      this.fx.confettiAt(x, y, 70); this.fx.confettiAt(x - 160, y - 40, 40); this.fx.confettiAt(x + 160, y - 40, 40);
      const medal = e.medal === 'gold' ? 'ORO' : e.medal === 'silver' ? 'PLATA' : 'BRONCE';
      this.hud.banner(`¡NIVEL COMPLETADO!\n${medal} · ${clockText(e.timeSec)}`, e.medal === 'gold' ? C.cheese : e.medal === 'silver' ? '#DDE6EC' : '#E0A064', 3200, 84);
      for (const x of this.explorers.values()) x.celebrate();
    });
    on('obst.runEnd', (e) => this.hud.banner(e.reason === 'complete' ? '¡EXPEDICIÓN COMPLETA!' : 'EXPEDICIÓN TERMINADA', e.reason === 'complete' ? C.cheese : C.danger, 3500, 84));
  }

  banner(text: string, color: string, ms?: number) { this.hud.banner(text, color, ms); }

  update(dtMs: number): void {
    const w = this.world, cam = this.scene.cameras.main;
    const dtReal = Math.min(dtMs, 100) / 1000;
    this.hitstopMs = Math.max(0, this.hitstopMs - dtMs);
    const dt = this.hitstopMs > 0 ? 0 : dtReal; // visuals freeze for the hit-stop
    this.t += dt;
    const a = Math.max(0, Math.min(1, w.alpha));

    // interpolated positions (a jump of more than 3 tiles is a respawn: no sliding across the map)
    const pos = new Map<number, { x: number; y: number }>();
    for (const p of w.players) {
      const far = Math.hypot(p.x - p.prevX, p.y - p.prevY) > 3 * TILE;
      const k = far ? 1 : a;
      const x = lerp(p.prevX, p.x, k), y = lerp(p.prevY, p.y, k);
      pos.set(p.id, { x, y });
      this.feet.set(p.id, { x: x + PLAYER_W / 2, y: y + PLAYER_H });
    }
    for (const id of [...this.feet.keys()]) if (!pos.has(id)) this.feet.delete(id);

    // camera
    const camPlayers: CamPlayer[] = w.players.map((p) => {
      const q = pos.get(p.id)!;
      const ok = !p.dead && p.connected;
      return { id: p.id, x: q.x + PLAYER_W / 2, y: q.y + PLAYER_H / 2, vx: p.vx, progress: progressAt(this.field, w.grid, q.x + PLAYER_W / 2, q.y + PLAYER_H / 2), active: ok && !p.bubble, visibleCheck: ok && !p.bubble };
    });
    const res = computeCamera({ players: camPlayers, boundsW: w.grid.w * TILE, boundsH: w.grid.h * TILE, zones: w.level.def.cameraZones }, this.camState, dtReal);
    this.camState = res.state; this.camera.result = res;
    cam.setZoom(res.state.zoom);
    cam.setScroll(res.state.cx - W / 2, res.state.cy - H / 2);
    const bubbleSec = DIFFICULTY_PARAMS[w.difficulty].bubbleSec;
    this.bubbleDue = this.stragglers.update(dtReal, res.offscreen.map((o) => o.id), bubbleSec);

    // world layers
    this.bg.update(res.state.cx, res.state.cy, res.rect.w, res.rect.h);
    this.tiles.refresh();
    this.tiles.setVisible(res.rect);
    this.tiles.drawLiquid(this.t, res.rect, w.hazard);

    // explorers
    const anchors = new Map<number, Anchor>();
    const seen = new Set<number>();
    for (const p of w.players) {
      seen.add(p.id);
      let ex = this.explorers.get(p.id);
      if (!ex) { ex = new Explorer(this.scene, this.explorerLayer, p.slot); this.explorers.set(p.id, ex); }
      const q = pos.get(p.id)!;
      ex.update(p, { x: q.x + PLAYER_W / 2, y: q.y + PLAYER_H, zoom: res.state.zoom, dt });
      anchors.set(p.id, { x: q.x + PLAYER_W / 2, y: q.y + PLAYER_H * 0.62 });
      if (p.inGoal && !this.prevInGoal.has(p.id)) ex.celebrate();
    }
    this.prevInGoal = new Set(w.players.filter((p) => p.inGoal).map((p) => p.id));
    for (const [id, ex] of this.explorers) if (!seen.has(id)) { ex.destroy(); this.explorers.delete(id); }
    this.rope.update(dt, w.ropes, anchors, res.rect, this.t, (px, py) => isSolidKind(tileAt(w.grid, Math.floor(px / TILE), Math.floor(py / TILE))));
    this.ents.update(dt, w.entities, w.players);
    this.hints.update(dt, [...pos.values()]);

    // hud
    const slotById = new Map(w.players.map((p) => [p.id, p.slot]));
    this.hud.update(dtMs, res.offscreen.map((o) => ({ id: o.id, slot: slotById.get(o.id) ?? 0, dirX: o.dirX, dirY: o.dirY, seconds: this.stragglers.seconds(o.id), limit: bubbleSec })),
      new Set(w.players.filter((p) => p.inGoal).map((p) => p.id)), w.players.map((p) => ({ id: p.id, slot: p.slot, inGoal: p.inGoal, connected: p.connected })));
    void VIEW_W; void VIEW_H; void ROPE_LEN; void BUBBLE_POP_SEC; void medalFor;
  }

  destroy(): void {
    for (const f of this.off) f();
    this.off = [];
    for (const e of this.explorers.values()) e.destroy();
    this.explorers.clear();
    this.hud.destroy(); this.fx.destroy(); this.hints.destroy(); this.ents.destroy(); this.rope.destroy(); this.tiles.destroy(); this.bg.destroy();
    for (const l of this.layers) l.destroy();
    this.hudLayer.destroy();
    const cam = this.scene.cameras.main;
    cam.setZoom(1); cam.setScroll(0, 0);
    this.scene.cameras.remove(this.uiCam);
  }
}
export type { PlayerView, WorldView };
