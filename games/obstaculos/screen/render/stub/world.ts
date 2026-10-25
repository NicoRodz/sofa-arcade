// FakeWorld, layer 4: the public class. Real-time driver and the fixed 60 Hz step (the call order in step() matters).
import { StubInteractions } from './interactions';
import { DT, PLAYER_H, PLAYER_W, TILE, T, boxHitsHazard, physicsFor, stepPlayers, tileAt, type StepInput } from '../../../index';
import type { WorldView } from '../view';

export type Controller = (i: number, w: FakeWorld) => StepInput & { grab?: boolean };

export class FakeWorld extends StubInteractions implements WorldView {
  controller: Controller = () => ({ move: 0, down: false, jump: false });

  // Real-time driver: call with the frame delta; runs fixed 60 Hz steps (max 4) and sets alpha for interpolation.
  advance(dtMs: number) {
    this.acc += Math.min(dtMs, 4 * DT * 1000);
    let steps = 0;
    while (this.acc >= DT * 1000 && steps < 4) {
      this.step();
      this.acc -= DT * 1000;
      steps++;
    }
    this.alpha = this.acc / (DT * 1000);
  }

  step() {
    this.stepN++;
    const now = this.stepN * DT;
    for (const s of this.slots) {
      s.view.prevX = s.body.x;
      s.view.prevY = s.body.y;
    }
    // bubbles requested by the camera
    for (const id of this.pendingBubbles.splice(0)) this.makeBubble(id);
    const live = this.slots.filter((s) => !s.view.dead && !s.view.bubble && s.view.carriedBy < 0);
    const inputs: StepInput[] = live.map((s) => {
      const c = this.controller(s.view.id, this);
      if (c.grab && !s.lastB) this.pressB(s);
      s.lastB = !!c.grab;
      return s.planted || s.view.holding === 'player'
        ? { move: 0, down: false, jump: c.jump }
        : { move: c.move, down: c.down, jump: c.jump };
    });
    const evs = stepPlayers(
      live.map((s) => s.body),
      inputs,
      this.grid,
      physicsFor(this.difficulty),
    );
    live.forEach((s, k) => {
      const e = evs[k]!,
        v = s.view;
      if (e.jump) this.emit('obst.jump', { player: v.id, kind: e.jump });
      if (e.land > 0) {
        this.emit('obst.land', { player: v.id, impact: e.land, on: e.landOn });
        v.thrown = false;
      }
      if (inputs[k]!.move !== 0) v.facing = inputs[k]!.move > 0 ? 1 : -1;
    });
    this.ropePass();
    // carried players ride on their holder's head
    for (const s of this.slots)
      if (s.view.carriedBy >= 0) {
        const h = this.slots[s.view.carriedBy]!.body;
        s.body.x = h.x;
        s.body.y = h.y - PLAYER_H - 4;
        s.body.vx = s.body.vy = 0;
      }
    // bubbles, deaths, pickups
    for (const s of this.slots) {
      const v = s.view;
      if (v.bubble) this.stepBubble(s, now);
      else if (v.dead) {
        if (now >= s.respawnAt) this.respawn(s, 'checkpoint');
      } else {
        v.invulnSec = Math.max(0, v.invulnSec - DT);
        if (v.invulnSec <= 0 && (boxHitsHazard(this.grid, s.body.x, s.body.y, PLAYER_W, PLAYER_H) || s.body.y > this.grid.h * TILE + 200))
          this.kill(
            s,
            s.body.y > this.grid.h * TILE
              ? 'fall'
              : tileAt(this.grid, Math.floor((s.body.x + PLAYER_W / 2) / TILE), Math.floor((s.body.y + PLAYER_H / 2) / TILE)) === T.Liquid
                ? 'liquid'
                : 'spikes',
            now,
          );
      }
    }
    this.pickups();
    this.sync();
    if (!this.clear) this.hud.timeSec = now;
  }
}
