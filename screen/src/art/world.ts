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
import { FlagView } from './flagView';
import { kText } from '@party/shared/versusReport';

export class World {
  private bg: Phaser.GameObjects.Image;
  private fx: Fx;
  private hud: Hud;
  private stations: StationViews;
  private chefs = new Map<number, Chef>();
  private marks: PuestoMarks;
  private off: (() => void)[] = [];
  private kitchenTiles: [number, number][][] = []; // versus: the floor tiles of each kitchen (tile centres)
  private flags: FlagView[] = [];
  private dims: Phaser.GameObjects.Graphics[] = [];
  private finale: { winner: number | null; ms: number; next: number } | null = null; // versus: the end-of-round celebration

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
  // The tint is a flat wash plus a stripe of the team's colour along the barrier, so even from the sofa the two halves read as two teams.
  private tintKitchens(view: RoundView) {
    const k = this.game.kitchens;
    if (!k) return;
    const g = this.scene.add.graphics().setDepth(1);
    view.teams!.forEach((team, i) => {
      const region = k.regions[i];
      const tiles: [number, number][] = [];
      g.fillStyle(hexNum(team.color), 0.24);
      k.comp.forEach((row, y) => row.forEach((c, x) => {
        if (c !== region) return;
        g.fillRect(OX + x * TILE, OY + y * TILE, TILE, TILE);
        tiles.push([x + 0.5, y + 0.5]);
      }));
      this.kitchenTiles[i] = tiles;
      if (!tiles.length) return;
      // the glyph sits on the floor tile closest to the middle of the kitchen (never over a counter island)
      const mx = tiles.reduce((a, t) => a + t[0], 0) / tiles.length, my = tiles.reduce((a, t) => a + t[1], 0) / tiles.length;
      const [gx, gy] = tiles.reduce((a, t) => (Math.hypot(t[0] - mx, t[1] - my) < Math.hypot(a[0] - mx, a[1] - my) ? t : a));
      makeText(this.scene, OX + gx * TILE, OY + gy * TILE, team.icon, { size: 150, color: team.color, stroke: 0, depth: 2 }).setAlpha(0.3);
    });
    // a stripe along every edge where a kitchen's floor meets something that is not its own floor and not a counter: the barrier
    const edge = this.scene.add.graphics().setDepth(2);
    view.teams!.forEach((team, i) => {
      edge.fillStyle(hexNum(team.color), 0.9);
      for (const [cx, cy] of this.kitchenTiles[i] ?? []) {
        const x = Math.floor(cx), y = Math.floor(cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const t = this.game.grid[y + dy]?.[x + dx];
          if (t?.kind !== 'wall') continue; // only the barrier and the outer wall, not the stations
          const px = OX + x * TILE, py = OY + y * TILE, w = 8;
          if (dx === 1) edge.fillRect(px + TILE - w, py, w, TILE); else if (dx === -1) edge.fillRect(px, py, w, TILE);
          else if (dy === 1) edge.fillRect(px, py + TILE - w, TILE, w); else edge.fillRect(px, py, TILE, w);
        }
      }
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
    on('streak', (e) => { if (!g.versus) this.hud.streak(e.n, e.mult); }); // versus: each plate reads its team's streak from the sim
    on('countdownTick', (e) => { if (e.kind === 'start') this.hud.countdown(e.n); else this.hud.clockPulse(); });
    on('roundEnd', (e) => {
      this.hud.timeUp();
      this.fx.shake(250, 0.006);
      if (g.versus) this.startFinale(e.winner ?? null);
    });
    // versus: the golden order, the handicap and the chefs that drop
    const teamName = (t: number) => this.view?.teams?.[t]?.name ?? `Equipo ${t + 1}`;
    const chefName = (id: number) => this.players().get(id)?.name ?? 'Un chef';
    on('vipNew', () => this.hud.vs?.vipNew());
    on('vipWon', (e) => {
      this.hud.vs?.vipWon(e.team, e.tie);
      const w = this.stations.pos(this.stations.windowIdx(e.team));
      this.fx.confettiBurst(w.x, w.y); this.fx.starBurst(w.x, w.y - TILE * 0.4, 8);
      this.fx.ring(w.x, w.y, 0xffd23f, 0.6, 2.8);
      this.fx.shake(120, 0.003);
    });
    on('vipLost', (e) => this.hud.vs?.vipLost(e.team));
    on('comeback', (e) => this.hud.vs?.notice(`¡Remontada de ${teamName(e.team)}!`, C.cheese));
    on('teamK', (e) => { if (e.k > 1) this.hud.vs?.notice(`Ventaja ${kText(e.k)} para ${teamName(e.team)}`, C.cheese); });
    on('playerDropped', (e) => this.hud.vs?.notice(`${chefName(e.player)} se cayó`, '#FF8D8D'));
    on('playerBack', (e) => this.hud.vs?.notice(`${chefName(e.player)} volvió`, '#8BE59A'));
    on('playerGone', (e) => this.hud.vs?.notice(`${chefName(e.player)} salió de la partida`, '#C9BBA7'));
    on('pantryRefill', () => { for (const s of g.stations) if (s.pantry) { const p = this.stations.pos(g.stations.indexOf(s)); this.fx.ring(p.x, p.y, 0xffd23f, 0.3, 1.2); } });
  }

  // Versus, the round just ended: the scoreboard reveals, the winner's kitchen celebrates under a waving flag and the other one slumps under a flag at half mast.
  private startFinale(winner: number | null) {
    this.hud.vs?.reveal(winner);
    this.finale = { winner, ms: 0, next: 0 };
    this.game.teams.forEach((t) => {
      const team = this.view?.teams?.[t.id];
      const tiles = this.kitchenTiles[t.id];
      if (!team || !tiles?.length) return;
      const mx = tiles.reduce((a, p) => a + p[0], 0) / tiles.length, my = tiles.reduce((a, p) => a + p[1], 0) / tiles.length;
      const [gx, gy] = tiles.reduce((a, p) => (Math.hypot(p[0] - mx, p[1] - my) < Math.hypot(a[0] - mx, a[1] - my) ? p : a));
      const mood = winner === null ? 'idle' : t.id === winner ? 'wave' : 'droop';
      const f = new FlagView(this.scene, `flag_${t.id}`, team.color, team.icon, mood, OX + gx * TILE, OY + (gy + 0.4) * TILE, 100 + OY + (gy + 1) * TILE, TILE * (mood === 'droop' ? 1.5 : 2.1));
      f.raise();
      this.flags.push(f);
      if (winner !== null && t.id !== winner) {
        const dim = this.scene.add.graphics().setDepth(3).setAlpha(0);
        dim.fillStyle(0x1a0f0c, 0.34);
        for (const [x, y] of tiles) dim.fillRect(OX + (x - 0.5) * TILE, OY + (y - 0.5) * TILE, TILE, TILE);
        this.scene.tweens.add({ targets: dim, alpha: 1, duration: 900 });
        this.dims.push(dim);
      }
    });
  }
  private updateFinale(dtMs: number) {
    const f = this.finale;
    if (!f) return;
    f.ms += dtMs;
    for (const fl of this.flags) fl.update(dtMs);
    if (f.ms < f.next) return;
    f.next = f.ms + 700;
    for (const [id, chef] of this.chefs) {
      const team = this.game.players.get(id)?.team;
      if (f.winner === null) continue;
      if (team === f.winner) chef.celebrate(); else chef.fail();
    }
    if (f.winner !== null && f.ms < 2400) {
      const tiles = this.kitchenTiles[f.winner] ?? [];
      const at = tiles[Math.floor(Math.random() * tiles.length)];
      if (at) { this.fx.confettiBurst(OX + at[0] * TILE, OY + at[1] * TILE); this.fx.starBurst(OX + at[0] * TILE, OY + at[1] * TILE, 4); }
    }
  }

  update(dtMs: number) {
    const g = this.game;
    this.updateFinale(dtMs);
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
    for (const f of this.flags) f.destroy();
    this.flags = [];
    this.dims = [];
    this.bg.destroy();
    this.scene.tweens.killAll();
    this.scene.children.removeAll(true);
  }
}
