// ObstaclesView, layer 2: the bus events turned into juice (puffs, rings, shakes, banners, hit-stop).
import { ObstaclesViewBase } from './base';
import { PLAYER_H, TILE } from '../../../index';
import type { AllObstEvents } from '../../../index';
import type { Emitter } from '@pichi/core/emitter';
import { C, CHEFS, hexNum } from '@pichi/screen-kit/art/tokens';
import { clockText } from '../hud';
import type { EntityView } from '../view';

const HIT_STOP_MS = 50;

export class ObstaclesEvents extends ObstaclesViewBase {
  // ---- events -> juice
  protected wire(bus: Emitter<AllObstEvents>) {
    const on = <K extends keyof AllObstEvents>(k: K, fn: (p: AllObstEvents[K]) => void) => this.off.push(bus.on(k, fn));
    const feet = (id: number) => this.feet.get(id) ?? { x: 0, y: 0 };
    const mid = (id: number) => {
      const f = feet(id);
      return { x: f.x, y: f.y - PLAYER_H / 2 };
    };
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
      const f = feet(e.player),
        k = Math.min(1, e.impact / 800);
      this.fx.puff(f.x, f.y, 2 + Math.round(k * 6));
      if (e.impact > 820) this.fx.shake(90, 0.0016);
    });
    on('obst.ropeTaut', (e) => {
      const l = this.world.ropes.find((r) => r.id === e.rope)?.links[e.link];
      if (l) {
        this.rope.twang(l.a, l.b);
        const a = mid(l.a),
          b = mid(l.b);
        this.fx.spark((a.x + b.x) / 2, (a.y + b.y) / 2, 3);
      }
    });
    on('obst.ropeStrain', (e) => {
      const l = this.world.ropes.find((r) => r.id === e.rope)?.links[e.link];
      if (l) {
        const a = mid(l.a),
          b = mid(l.b);
        this.fx.spark((a.x + b.x) / 2, (a.y + b.y) / 2, 6);
        this.fx.shake(70, 0.0012);
      }
    });
    on('obst.grab', (e) => {
      const m = mid(e.player);
      this.fx.ring(m.x, m.y - 6, 0xffffff, 0.3, 1.0);
    });
    on('obst.throw', (e) => {
      const m = mid(e.player);
      this.fx.ring(m.x, m.y - 10, 0xffd23f, 0.3, 1.4);
      this.fx.float(m.x, m.y - 50, '¡Lanzado!', C.cheese, 26);
    });
    on('obst.handCatch', (e) => {
      const m = mid(e.target);
      this.fx.ring(m.x, m.y, 0x3fa34d, 0.3, 1.5);
      this.fx.float(m.x, m.y - 48, '¡Mano!', '#7BE08A', 28);
    });
    on('obst.death', (e) => {
      const m = mid(e.player);
      this.hitstopMs = HIT_STOP_MS;
      this.fx.burst(m.x, m.y, slotOf(e.player), 18);
      this.fx.shake(220, 0.006);
      this.explorers.get(e.player)?.fail();
    });
    on('obst.bubble', (e) => {
      const m = mid(e.player);
      this.fx.ring(m.x, m.y, 0x9be0ff, 0.5, 2);
      this.fx.float(m.x, m.y - 54, '¡Burbuja!', '#9BE0FF', 28);
      this.stragglers.reset(e.player);
    });
    on('obst.respawn', (e) => {
      const m = mid(e.player);
      this.fx.ring(m.x, m.y, col(e.player), 0.3, 1.6);
      this.fx.starBurst(m.x, m.y, 5);
    });
    on('obst.checkpoint', (e) => {
      const p = this.world.level.markers.checkpoint[e.index];
      if (!p) return;
      const x = (p.x + 0.5) * TILE,
        y = (p.y + 0.3) * TILE;
      this.fx.ring(x, y, 0xffc93c, 0.4, 2.2);
      this.fx.starBurst(x, y - 40, 8);
      this.fx.float(x, y - 90, '¡Checkpoint!', C.cheese, 34);
    });
    on('obst.star', (e) => {
      const p = this.world.level.markers.star[e.index];
      if (!p) return;
      const x = (p.x + 0.5) * TILE,
        y = (p.y + 0.5) * TILE;
      this.fx.starBurst(x, y, 8);
      this.fx.ring(x, y, 0xffd23f, 0.3, 1.5);
      this.fx.float(x, y - 30, e.streak > 1 ? `¡Estrella x${e.streak}!` : '¡Estrella!', C.cheese, 28);
    });
    on('obst.plate', (e) => {
      const p = ent(e.id);
      if (p) this.fx.puff(p.x + p.w / 2, p.y + p.h - 4, 3);
    });
    on('obst.gate', (e) => {
      const p = ent(e.id);
      if (p) {
        this.fx.puff(p.x + p.w / 2, p.y + p.h / 2, 6);
        this.fx.shake(120, 0.002);
      }
    });
    on('obst.goalEnter', (e) => {
      const g = this.world.level.markers.goal[0];
      const m = mid(e.player);
      this.explorers.get(e.player)?.celebrate();
      this.fx.confettiAt(g ? (g.x + 0.5) * TILE : m.x, g ? g.y * TILE : m.y, 14);
      this.fx.float(m.x, m.y - 56, `${e.inside}/${e.total}`, C.cream, 30);
    });
    on('obst.levelClear', (e) => {
      const g = this.world.level.markers.goal[0];
      const x = g ? (g.x + 0.5) * TILE : 0,
        y = g ? g.y * TILE : 0;
      this.fx.confettiAt(x, y, 70);
      this.fx.confettiAt(x - 160, y - 40, 40);
      this.fx.confettiAt(x + 160, y - 40, 40);
      const medal = e.medal === 'gold' ? 'ORO' : e.medal === 'silver' ? 'PLATA' : 'BRONCE';
      this.hud.banner(
        `¡NIVEL COMPLETADO!\n${medal} · ${clockText(e.timeSec)}`,
        e.medal === 'gold' ? C.cheese : e.medal === 'silver' ? '#DDE6EC' : '#E0A064',
        3200,
        84,
      );
      for (const x of this.explorers.values()) x.celebrate();
    });
    // campaign layer: shared hearts, the 3-2-1 of "go", the super jump and the edge assist
    on('obst.heartsOut', (e) => {
      this.hud.banner(
        e.toStart ? '¡Sin corazones!\nOtra vez desde el inicio' : '¡Corazones de vuelta!',
        e.toStart ? C.danger : '#7BE08A',
        1800,
        60,
      );
    });
    on('obst.countdown', (e) => {
      this.hud.banner(e.n > 0 ? String(e.n) : '¡YA!', e.n > 0 ? C.cheese : '#7BE08A', e.n > 0 ? 900 : 700, 150);
    });
    on('obst.superJump', (e) => {
      for (const id of e.players) {
        const m = mid(id);
        this.fx.ring(m.x, m.y, 0xffd23f, 0.4, 2);
      }
      const a = mid(e.players[0] ?? 0);
      this.fx.float(a.x, a.y - 60, '¡Supersalto!', C.cheese, 32);
    });
    on('obst.edgeAssist', (e) => {
      const m = mid(e.player);
      this.fx.float(m.x, m.y - 50, '¡Arriba!', '#7BE08A', 26);
    });
    // A5: balance, target, soft enemies, ice, wind, pickaxe (one juice effect each; the sound is audio/recipes.ts CAMPAIGN_HANDLERS)
    on('obst.balance', (e) => {
      const p = ent(`obj${e.id}`),
        q = ent(`obj${e.other}`);
      for (const v of [p, q])
        if (v) {
          this.fx.puff(v.x + v.w / 2, v.y + 8, 5);
          this.fx.shake(80, 0.0012);
        }
    });
    on('obst.target', (e) => {
      const p = ent(`obj${e.id}`);
      if (!p) return;
      const x = p.x + p.w / 2,
        y = p.y + p.h / 2;
      this.fx.ring(x, y, 0xffd23f, 0.4, 2.2);
      this.fx.starBurst(x, y, 8);
      this.fx.float(x, y - 44, '¡Diana!', C.cheese, 30);
    });
    on('obst.enemy', (e) => {
      const en = ent(`enemy${e.enemy}`);
      if (!en) return;
      const x = en.x + en.w / 2;
      if (e.action === 'stun') {
        this.fx.starBurst(x, en.y, 6);
        this.fx.float(x, en.y - 26, '¡Aturdido!', C.cheese, 26);
      } else this.fx.puff(x, en.y + en.h - 4, 4);
    });
    on('obst.ice', (e) => {
      const f = feet(e.player);
      this.fx.ring(f.x, f.y, 0x9be0ff, 0.2, 1.1);
    });
    on('obst.wind', (e) => {
      if (e.phase === 'warn') this.hud.banner(e.dir > 0 ? '¡Viento! →' : '← ¡Viento!', '#9BE0FF', 900, 56);
    });
    on('obst.pickaxe', (e) => {
      const m = mid(e.player);
      if (e.action === 'take') this.fx.float(m.x, m.y - 56, '¡Piolet!', '#BFEAFF', 28);
      else if (e.action === 'pass') this.fx.float(m.x, m.y - 56, '¡Toma!', C.cheese, 28);
      else if (e.action === 'climb') this.fx.spark(m.x, m.y, 5);
      else this.fx.puff(m.x, m.y + PLAYER_H / 2, 6);
    });
    // A6: lantern, bungee, sinkers, geyser (one juice effect each; the sound is audio/recipes.ts CAMPAIGN_HANDLERS)
    on('obst.lantern', (e) => {
      const m = e.player >= 0 ? mid(e.player) : null;
      if (e.action === 'take') {
        if (m) this.fx.float(m.x, m.y - 56, '¡Farol!', '#FFE9A0', 28);
      } else if (e.action === 'pass') {
        if (m) this.fx.float(m.x, m.y - 56, '¡Toma!', C.cheese, 28);
      } else if (e.action === 'light') {
        if (m && this.t - this.lastLight > 0.9) {
          this.lastLight = this.t;
          this.fx.ring(m.x, m.y, 0xffe9a0, 0.6, 3.4);
        }
      } // (the crystals change a column at a time as the circle moves: one ring per second at most)
    });
    on('obst.bungee', (e) => {
      const m = mid(e.player);
      this.fx.ring(m.x, m.y, 0xff9a2e, 0.3, 1.8);
      this.fx.float(m.x, m.y - 52, '¡Boing!', '#FFB45A', 28);
    });
    on('obst.sinker', (e) => {
      const p = ent(`obj${e.id}`);
      if (p) {
        this.fx.puff(p.x + p.w / 2, p.y + 6, 5);
        this.fx.float(p.x + p.w / 2, p.y - 14, '¡Se hunde!', '#BFEAFF', 24);
      }
    });
    on('obst.geyser', (e) => {
      const p = ent(`obj${e.id}`);
      if (!p) return;
      const x = p.x + p.w / 2,
        y = p.y + p.h - 4;
      if (e.phase === 'warn') this.fx.puff(x, y, 6);
      else if (e.phase === 'gush') {
        this.fx.puff(x, y, 12);
        this.fx.ring(x, y, 0x9be0ff, 0.4, 2.4);
        this.fx.shake(120, 0.002);
      }
    });
    on('obst.runEnd', (e) =>
      this.hud.banner(
        e.reason === 'complete' ? '¡EXPEDICIÓN COMPLETA!' : 'EXPEDICIÓN TERMINADA',
        e.reason === 'complete' ? C.cheese : C.danger,
        3500,
        84,
      ),
    );
  }
}
