// FakeWorld, layer 3: the B button (lift, throw, plant), the naive rope correction and the pickups.
import type { Slot } from './core';
import { StubLifecycle } from './lifecycle';
import { PLAYER_H, PLAYER_W, ROPE_LEN, TILE, boxHitsSolid, type Body } from '../../../index';

export class StubInteractions extends StubLifecycle {
  protected pressB(s: Slot) {
    const v = s.view,
      b = s.body;
    if (v.holding === 'player') {
      // throw
      const t = this.slots[s.carryId]!;
      t.view.carriedBy = -1;
      t.view.thrown = true;
      t.body.vx = 420 * v.facing;
      t.body.vy = -950;
      v.holding = 'none';
      this.emit('obst.throw', { player: v.id, target: t.view.id, vx: t.body.vx, vy: t.body.vy });
      s.carryId = -1;
      return;
    }
    if (s.planted) {
      s.planted = false;
      v.planted = false;
      this.emit('obst.release', { player: v.id });
      return;
    }
    const near = this.slots.find(
      (o) =>
        o !== s &&
        !o.view.dead &&
        !o.view.bubble &&
        Math.abs(o.body.x - b.x) < 40 &&
        Math.abs(o.body.y - b.y) < 40 &&
        o.view.carriedBy < 0 &&
        b.grounded,
    );
    if (near) {
      near.view.carriedBy = v.id;
      v.holding = 'player';
      s.carryId = near.view.id;
      this.emit('obst.grab', { player: v.id, target: 'player', targetId: near.view.id });
      return;
    }
    if (b.grounded) {
      s.planted = true;
      v.planted = true;
      this.emit('obst.grab', { player: v.id, target: 'ring', targetId: -1 });
    }
  }

  protected ropePass() {
    if (!this.ropeSet.length) return;
    for (let it = 0; it < 2; it++)
      for (const group of this.ropeSet)
        for (let k = 0; k + 1 < group.length; k++) {
          const A = this.slots[group[k]!]!,
            B = this.slots[group[k + 1]!]!;
          if (A.view.dead || B.view.dead || A.view.bubble || B.view.bubble || A.view.carriedBy >= 0 || B.view.carriedBy >= 0) continue;
          const ax = A.body.x + PLAYER_W / 2,
            ay = A.body.y + PLAYER_H / 2,
            bx = B.body.x + PLAYER_W / 2,
            by = B.body.y + PLAYER_H / 2;
          const dx = bx - ax,
            dy = by - ay,
            d = Math.hypot(dx, dy);
          if (d <= ROPE_LEN) continue;
          const exc = Math.min(24, d - ROPE_LEN);
          const ia = A.planted ? 1 / 8 : A.body.grounded ? 1 / 3 : 1,
            ib = B.planted ? 1 / 8 : B.body.grounded ? 1 / 3 : 1;
          this.nudge(A.body, (dx / d) * exc * (ia / (ia + ib)), (dy / d) * exc * (ia / (ia + ib)));
          this.nudge(B.body, (-dx / d) * exc * (ib / (ia + ib)), (-dy / d) * exc * (ib / (ia + ib)));
        }
  }
  protected nudge(b: Body, dx: number, dy: number) {
    if (!boxHitsSolid(this.grid, b.x + dx, b.y + dy, PLAYER_W, PLAYER_H)) {
      b.x += dx;
      b.y += dy;
    } else if (!boxHitsSolid(this.grid, b.x + dx, b.y, PLAYER_W, PLAYER_H)) b.x += dx;
  }

  protected pickups() {
    const now = this.timeSec;
    this.level.markers.star.forEach((c, i) => {
      const e = this.entities.find((q) => q.id === `star${i}`)!;
      if (e.on) return;
      const who = this.slots.find(
        (s) =>
          !s.view.dead &&
          !s.view.bubble &&
          Math.abs(s.body.x + PLAYER_W / 2 - (c.x + 0.5) * TILE) < 30 &&
          Math.abs(s.body.y + PLAYER_H / 2 - (c.y + 0.5) * TILE) < 36,
      );
      if (who) {
        e.on = true;
        this.hud.starsTaken++;
        this.emit('obst.star', { player: who.view.id, index: i, streak: 1 });
      }
    });
    this.level.markers.checkpoint.forEach((c, i) => {
      const e = this.entities.find((q) => q.id === `cp${i}`)!;
      if (e.on) return;
      const who = this.slots.find(
        (s) =>
          !s.view.dead &&
          !s.view.bubble &&
          Math.abs(s.body.x + PLAYER_W / 2 - (c.x + 0.5) * TILE) < 40 &&
          Math.abs(s.body.y + PLAYER_H / 2 - (c.y + 0.5) * TILE) < 40,
      );
      if (who) {
        e.on = true;
        this.lastCp = i + 1;
        this.emit('obst.checkpoint', { player: who.view.id, index: i });
      }
    });
    const g = this.level.markers.goal[0];
    if (g) {
      let inside = 0;
      for (const s of this.slots) {
        const was = s.view.inGoal;
        s.view.inGoal =
          !s.view.dead &&
          !s.view.bubble &&
          Math.abs(s.body.x + PLAYER_W / 2 - (g.x + 0.5) * TILE) < 56 &&
          Math.abs(s.body.y + PLAYER_H / 2 - (g.y + 0.5) * TILE) < 60;
        if (s.view.inGoal) inside++;
        if (s.view.inGoal && !was)
          this.emit('obst.goalEnter', { player: s.view.id, inside: this.slots.filter((o) => o.view.inGoal).length, total: this.n });
      }
      if (inside === this.n && !this.clear) {
        this.clear = true;
        this.emit('obst.levelClear', {
          level: this.level.def.id,
          timeSec: now,
          medal: now <= this.level.def.parSec ? 'gold' : 'silver',
          stars: this.hud.starsTaken,
          deaths: 0,
        });
      }
    }
  }
}
