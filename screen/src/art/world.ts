// One round on screen: background, station views, chefs, HUD and the reactions to game events.
import Phaser from 'phaser';
import type { Emitter, GameEvents } from '@party/shared/events';
import type { Game } from '@party/shared/game';
import type { PublicPlayer } from '@party/shared';
import { C, OX, OY, TILE } from './tokens';
import { buildBackground } from './env';
import { Chef } from './chef';
import { Fx } from './fx';
import { Hud } from './hud';
import { StationViews, place } from './stations';
import { foodKey } from './food';
import { PuestoMarks, type PuestoView } from './puestos';

export class World {
  private bg: Phaser.GameObjects.Image;
  private fx: Fx;
  private hud: Hud;
  private stations: StationViews;
  private chefs = new Map<number, Chef>();
  private marks: PuestoMarks;
  private off: (() => void)[] = [];

  constructor(private scene: Phaser.Scene, private game: Game, private players: () => Map<number, PublicPlayer>, private puestos: () => Map<number, PuestoView>, bus: Emitter<GameEvents>, mapId: string, seed: number) {
    this.bg = buildBackground(scene, game.grid, mapId, seed);
    this.fx = new Fx(scene);
    this.stations = new StationViews(scene, game, this.fx);
    this.hud = new Hud(scene, game);
    this.marks = new PuestoMarks(scene, game, puestos);
    this.wire(bus);
  }

  private chefOf(id: number) { return this.chefs.get(id); }
  private feet(gp: { x: number; y: number }) { return { x: OX + gp.x * TILE, y: OY + (gp.y + 0.3) * TILE }; }

  private wire(bus: Emitter<GameEvents>) {
    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.off.push(bus.on(k, fn));
    const g = this.game;
    on('itemPicked', (e) => this.chefOf(e.player)?.bump());
    on('interactInvalid', (e) => this.chefOf(e.player)?.fail());
    on('chopDone', (e) => {
      const p = this.stations.pos(e.station);
      this.fx.dustPoof(p.x, p.y);
      this.chefOf(e.player)?.bump();
    });
    on('potStart', (e) => { const p = this.stations.pos(e.station); this.fx.ring(p.x, p.y + TILE * 0.2, 0xff8a1f, 0.5, 1.5); });
    on('orderWarning', (e) => this.hud.orderWarning(e.order));
    on('orderExpired', (e) => {
      this.hud.expired.add(e.order);
      const c = this.hud.ticketCenter(e.order);
      this.fx.float(Math.max(160, c.x), c.y + 70, g.params.penalty ? String(g.params.penalty) : '¡Vencido!', C.danger, 44);
      this.fx.shake(100, 0.003);
      for (const ch of this.chefs.values()) ch.fail();
    });
    on('delivered', (e) => {
      const ch = this.chefOf(e.player);
      ch?.celebrate();
      const wi = this.stations.windowIdx();
      const w = this.stations.pos(wi);
      this.fx.confettiBurst(w.x, w.y);
      this.stations.ding(wi);
      if (ch) {
        this.fx.starBurst(ch.root.x, ch.root.y - TILE * 0.5, 5);
        this.fx.float(ch.root.x, ch.root.y - TILE * 1.15, `+${e.points}`, C.cheese, 52);
      }
      this.fx.ring(w.x, w.y, 0xffc93c, 0.5, 2);
      const box = place(this.scene, foodKey('box'), w.x, w.y - TILE * 0.1, 1.0).setDepth(1300);
      this.scene.tweens.add({ targets: box, y: box.y - 90, alpha: 0, duration: 800, ease: 'cubic.out', onComplete: () => box.destroy() });
    });
    on('countdownTick', (e) => { if (e.kind === 'start') this.hud.countdown(e.n); else this.hud.clockPulse(); });
    on('roundEnd', () => { this.hud.timeUp(); this.fx.shake(250, 0.006); });
  }

  update(dtMs: number) {
    const g = this.game;
    const chop = new Map<number, 'chop' | 'stretch'>();
    for (const gp of g.players.values()) {
      const info = this.players().get(gp.id);
      if (!info) continue;
      let chef = this.chefs.get(gp.id);
      if (!chef) {
        chef = new Chef(this.scene, gp.slot, info.name);
        chef.onHit = (kind) => {
          const cur = this.game.players.get(gp.id);
          if (!cur || cur.chopAt < 0) return;
          const p = this.stations.pos(cur.chopAt);
          if (kind === 'stretch') this.fx.flourPuff(p.x, p.y);
          else this.fx.chop(p.x, p.y, { raw0: 0, raw1: 1, raw2: 2 }[g.stations[cur.chopAt]?.item as 'raw0' | 'raw1' | 'raw2'] ?? 1);
        };
        this.chefs.set(gp.id, chef);
      }
      chef.setName(info.name);
      let action: 'none' | 'chop' | 'stretch' = 'none';
      if (gp.cutting && gp.chopAt >= 0) {
        action = g.stations[gp.chopAt]?.item === 'raw0' ? 'stretch' : 'chop';
        chop.set(gp.chopAt, action);
      }
      const f = this.feet(gp);
      chef.update(dtMs, { x: f.x, y: f.y, fx: gp.fx, fy: gp.fy, item: gp.item, action, connected: info.connected });
    }
    for (const [id, c] of this.chefs) if (!g.players.has(id)) { c.destroy(); this.chefs.delete(id); }
    this.stations.update(dtMs, chop);
    this.marks.update(dtMs, this.chefs);
    this.hud.update(dtMs);
  }

  destroy() {
    for (const f of this.off) f();
    this.off = [];
    for (const c of this.chefs.values()) c.destroy();
    this.chefs.clear();
    this.stations.destroy();
    this.marks.destroy();
    this.hud.destroy();
    this.bg.destroy();
    this.scene.tweens.killAll();
    this.scene.children.removeAll(true);
  }
}
