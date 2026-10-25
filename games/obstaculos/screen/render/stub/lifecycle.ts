// FakeWorld, layer 2: deaths, respawns and the rescue bubbles.
import { StubCore, type Slot } from './core';
import { BUBBLE_INVULN_SEC, BUBBLE_POP_SEC, BUBBLE_SPEED_TILES, DT, PLAYER_H, PLAYER_W, TILE, type ObstEvents } from '../../../index';

export class StubLifecycle extends StubCore {
  protected kill(s: Slot, cause: ObstEvents['obst.death']['cause'], now: number) {
    const v = s.view;
    if (v.holding === 'player') {
      this.slots[s.carryId]!.view.carriedBy = -1;
      v.holding = 'none';
    }
    v.dead = true;
    v.planted = false;
    s.planted = false;
    s.respawnAt = now + 1.0;
    this.emit('obst.death', { player: v.id, cause });
    if (Number.isFinite(this.hud.lives)) this.hud.lives = Math.max(0, this.hud.lives - 1);
  }
  protected respawn(s: Slot, via: 'checkpoint' | 'bubble') {
    const v = s.view,
      c = this.level.markers.checkpoint[this.lastCp - 1] ?? this.level.markers.spawn[0]!;
    if (via === 'checkpoint') {
      s.body.x = c.x * TILE + (TILE - PLAYER_W) / 2;
      s.body.y = (c.y + 1) * TILE - PLAYER_H;
      v.prevX = s.body.x;
      v.prevY = s.body.y;
    }
    s.body.vx = s.body.vy = 0;
    v.dead = false;
    v.bubble = null;
    v.invulnSec = BUBBLE_INVULN_SEC;
    this.emit('obst.respawn', { player: v.id, via });
  }
  protected makeBubble(id: number) {
    const s = this.slots[id];
    if (!s || s.view.bubble || s.view.dead) return;
    if (s.view.holding === 'player') {
      this.slots[s.carryId]!.view.carriedBy = -1;
      s.view.holding = 'none';
    }
    s.view.bubble = { phase: 'fly', t: 0 };
    s.view.planted = false;
    s.planted = false;
    s.view.carriedBy = -1;
    this.emit('obst.bubble', { player: id, reason: 'offscreen' });
  }
  protected stepBubble(s: Slot, now: number) {
    const v = s.view,
      b = v.bubble!;
    b.t += DT;
    if (b.phase === 'pop') {
      if (b.t >= BUBBLE_POP_SEC) this.respawn(s, 'bubble');
      return;
    }
    // fly to the median of the others by x (stub: the median player's current spot)
    const others = this.slots.filter((o) => o !== s && !o.view.dead && !o.view.bubble).sort((p, q) => p.body.x - q.body.x);
    const tgt = others[Math.floor((others.length - 1) / 2)];
    if (!tgt) return;
    const dx = tgt.body.x - s.body.x,
      dy = tgt.body.y - 20 - s.body.y,
      d = Math.hypot(dx, dy);
    const sp = BUBBLE_SPEED_TILES * TILE * DT;
    if (d <= sp + 6) {
      s.body.x = tgt.body.x;
      s.body.y = tgt.body.y - 20;
      b.phase = 'pop';
      b.t = 0;
      return;
    }
    s.body.x += (dx / d) * sp;
    s.body.y += (dy / d) * sp;
    s.body.vx = (dx / d) * 540;
    s.body.vy = (dy / d) * 540;
    void now;
  }
}
