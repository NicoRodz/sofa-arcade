// One round on screen: background, station views, chefs, HUD and the reactions to game events.
import Phaser from 'phaser';
import type { Emitter, GameEvents } from '@party/shared/events';
import type { Game } from '@party/shared/game';
import type { PublicPlayer } from '@party/shared';
import { C, OX, OY, TILE, hexNum } from './tokens';
import { buildBackground } from './env';
import { Chef } from './chef';
import { Fx, makeText } from './fx';
import { Hud, ticketKey, type RoundView } from './hud';
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

  constructor(private scene: Phaser.Scene, private game: Game, private players: () => Map<number, PublicPlayer>, private puestos: () => Map<number, PuestoView>, bus: Emitter<GameEvents>, mapId: string, seed: number, private view?: RoundView) {
    this.bg = buildBackground(scene, game.grid, mapId, seed);
    if (game.versus && view?.teams) this.tintKitchens(view);
    this.fx = new Fx(scene);
    this.stations = new StationViews(scene, game, this.fx);
    this.hud = new Hud(scene, game, view);
    this.marks = new PuestoMarks(scene, game, puestos);
    this.wire(bus);
  }

  private chefOf(id: number) { return this.chefs.get(id); }

  // Versus: each kitchen's floor takes its team's colour, with the team's glyph big and faint in the middle (colour alone never says whose it is).
  private tintKitchens(view: RoundView) {
    const k = this.game.kitchens;
    if (!k) return;
    const g = this.scene.add.graphics().setDepth(1);
    view.teams!.forEach((team, i) => {
      const region = k.regions[i];
      let sx = 0, sy = 0, n = 0;
      g.fillStyle(hexNum(team.color), 0.17);
      k.comp.forEach((row, y) => row.forEach((c, x) => {
        if (c !== region) return;
        g.fillRect(OX + x * TILE, OY + y * TILE, TILE, TILE);
        sx += x + 0.5; sy += y + 0.5; n++;
      }));
      if (n) makeText(this.scene, OX + (sx / n) * TILE, OY + (sy / n) * TILE, team.icon, { size: 170, color: team.color, stroke: 0, depth: 2 }).setAlpha(0.2);
    });
  }
  private feet(gp: { x: number; y: number }) { return { x: OX + gp.x * TILE, y: OY + (gp.y + 0.3) * TILE }; }

  private wire(bus: Emitter<GameEvents>) {
    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.off.push(bus.on(k, fn));
    const g = this.game;
    on('itemPicked', (e) => this.chefOf(e.player)?.bump());
    on('interactInvalid', (e) => this.chefOf(e.player)?.fail());
    on('dash', (e) => {
      this.chefOf(e.player)?.dash();
      const puff = () => { const q = g.players.get(e.player); if (q) { const f = this.feet(q); this.fx.dashDust(f.x, f.y); } };
      puff();
      for (const ms of [45, 90, 135]) this.scene.time.delayedCall(ms, puff);
    });
    on('bump', (e) => {
      const o = g.players.get(e.other);
      if (!o) return;
      const f = this.feet(o);
      this.fx.starBurst(f.x, f.y - TILE * 0.45, 4);
      this.fx.ring(f.x, f.y, 0xffffff, 0.3, 1.1);
      this.fx.shake(70, 0.002);
      this.chefOf(e.other)?.bump();
    });
    on('chopDone', (e) => {
      const p = this.stations.pos(e.station);
      this.fx.dustPoof(p.x, p.y);
      this.chefOf(e.player)?.bump();
    });
    on('washDone', (e) => { const p = this.stations.pos(e.station); this.fx.ring(p.x, p.y, 0x7fd0f2, 0.4, 1.3); this.fx.bubbles(p.x, p.y); this.chefOf(e.player)?.bump(); });
    on('dirtyNew', (e) => { const p = this.stations.pos(e.station); this.fx.ring(p.x, p.y, 0xd7263d, 0.3, 1.1); });
    on('potStart', (e) => { const p = this.stations.pos(e.station); this.fx.ring(p.x, p.y + TILE * 0.2, 0xff8a1f, 0.5, 1.5); });
    on('orderWarning', (e) => this.hud.orderWarning(ticketKey(e.order, e.team)));
    on('orderExpired', (e) => {
      const key = ticketKey(e.order, e.team);
      this.hud.expired.add(key);
      const c = this.hud.ticketCenter(key);
      this.fx.float(Math.max(160, c.x), c.y + 70, g.params.penalty ? String(g.params.penalty) : '¡Vencido!', C.danger, 44);
      this.fx.shake(100, 0.003);
      for (const ch of this.chefs.values()) ch.fail();
    });
    on('delivered', (e) => {
      const ch = this.chefOf(e.player);
      ch?.celebrate();
      const wi = this.stations.windowIdx(e.team);
      const w = this.stations.pos(wi);
      this.fx.confettiBurst(w.x, w.y);
      this.stations.ding(wi);
      if (ch) {
        this.fx.starBurst(ch.root.x, ch.root.y - TILE * 0.5, 5);
        this.fx.float(ch.root.x, ch.root.y - TILE * 1.15, `+${e.points}`, C.cheese, 52);
        if (e.mult > 1) this.fx.float(ch.root.x, ch.root.y - TILE * 1.55, `propina x${e.mult}`, e.mult >= 4 ? C.tomato : C.fire, 30);
      }
      this.fx.ring(w.x, w.y, 0xffc93c, 0.5, 2);
      const box = place(this.scene, foodKey('box'), w.x, w.y - TILE * 0.1, 1.0).setDepth(1300);
      this.scene.tweens.add({ targets: box, y: box.y - 90, alpha: 0, duration: 800, ease: 'cubic.out', onComplete: () => box.destroy() });
    });
    on('dishRejected', (e) => {
      const w = this.stations.pos(this.stations.windowIdx(e.team));
      this.fx.float(w.x, w.y - TILE * 0.4, '¡Pedido equivocado!', C.danger, 38);
      this.chefOf(e.player)?.fail();
      this.fx.shake(90, 0.003);
    });
    on('streak', (e) => { if (!g.versus) this.hud.streak(e.n, e.mult); }); // versus: the streak per team is F4's HUD
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
          if (g.stations[cur.chopAt]?.kind === 'sink') this.fx.bubbles(p.x, p.y);
          else if (kind === 'stretch') this.fx.flourPuff(p.x, p.y);
          else this.fx.chop(p.x, p.y, { raw0: 0, raw1: 1, raw2: 2 }[g.stations[cur.chopAt]?.item as 'raw0' | 'raw1' | 'raw2'] ?? 1);
        };
        const team = g.versus ? this.view?.teams?.[gp.team] : undefined;
        if (team) chef.setTeam(hexNum(team.color));
        this.chefs.set(gp.id, chef);
      }
      chef.setName(info.name);
      let action: 'none' | 'chop' | 'stretch' = 'none';
      if (gp.cutting && gp.chopAt >= 0) {
        const at = g.stations[gp.chopAt];
        action = at?.kind === 'sink' || at?.item === 'raw0' ? 'stretch' : 'chop'; // washing scrubs like stretching dough
        chop.set(gp.chopAt, action);
      }
      const f = this.feet(gp);
      chef.update(dtMs, { x: f.x, y: f.y, fx: gp.fx, fy: gp.fy, item: gp.item, action, connected: info.connected && !gp.ghost, ghost: gp.crossing });
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
