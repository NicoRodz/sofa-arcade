// ObstaclesView, layer 3: the public class. update() runs the frame: interpolation, camera, explorers and the sub-views.
import { ObstaclesEvents } from './events';
import type Phaser from 'phaser';
import { PLAYER_H, PLAYER_W, ROPE_LEN, TILE, DIFFICULTY_PARAMS, BUBBLE_POP_SEC, isSolidKind, tileAt } from '../../../index';
import { H, W } from '@pichi/screen-kit/art';
import { buildFxTextures } from '@pichi/screen-kit/art/fx';
import type { Anchor } from '../rope';
import { buildEntityTextures } from '../entities';
import { Explorer, buildRigTextures } from '../rig';
import { medalFor } from '../hud';
import { VIEW_H, VIEW_W, computeCamera, progressAt, type CamPlayer } from '../camera';

export function buildObstacleTextures(scene: Phaser.Scene): void {
  buildFxTextures(scene);
  buildRigTextures(scene);
  buildEntityTextures(scene);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class ObstaclesView extends ObstaclesEvents {
  banner(text: string, color: string, ms?: number, size?: number) {
    this.hud.banner(text, color, ms, size);
  }

  update(dtMs: number): void {
    const w = this.world,
      cam = this.scene.cameras.main;
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
      const x = lerp(p.prevX, p.x, k),
        y = lerp(p.prevY, p.y, k);
      pos.set(p.id, { x, y });
      this.feet.set(p.id, { x: x + PLAYER_W / 2, y: y + PLAYER_H });
    }
    for (const id of [...this.feet.keys()]) if (!pos.has(id)) this.feet.delete(id);

    // camera
    const camPlayers: CamPlayer[] = w.players.map((p) => {
      const q = pos.get(p.id)!;
      const ok = !p.dead && p.connected;
      return {
        id: p.id,
        x: q.x + PLAYER_W / 2,
        y: q.y + PLAYER_H / 2,
        vx: p.vx,
        progress: progressAt(this.field, w.grid, q.x + PLAYER_W / 2, q.y + PLAYER_H / 2),
        active: ok && !p.bubble,
        visibleCheck: ok && !p.bubble,
      };
    });
    const res = computeCamera(
      {
        players: camPlayers,
        boundsW: w.grid.w * TILE,
        boundsH: w.grid.h * TILE,
        zones: w.level.def.cameraZones,
        look: w.look ?? undefined,
      },
      this.camState,
      dtReal,
    );
    this.camState = res.state;
    this.camera.result = res;
    cam.setZoom(res.state.zoom);
    cam.setScroll(res.state.cx - W / 2, res.state.cy - H / 2);
    const bubbleSec = w.bubbleSec ?? DIFFICULTY_PARAMS[w.difficulty].bubbleSec;
    this.bubbleDue = this.stragglers.update(
      dtReal,
      res.offscreen.map((o) => o.id),
      bubbleSec,
    );

    // wind streaks while a gust blows (dynamic 8): a few white lines across the picture, drifting with the gust
    const wd = w.wind;
    if (wd && wd.phase === 'gust') {
      this.windAcc += dt;
      while (this.windAcc >= 0.06) {
        this.windAcc -= 0.06;
        this.windN++;
        const st = res.state,
          hw = W / 2 / st.zoom,
          hh = H / 2 / st.zoom;
        const x = st.cx - hw + ((this.windN * 0.618034) % 1) * 2 * hw,
          y = st.cy - hh + ((this.windN * 0.381966 + 0.3) % 1) * 2 * hh;
        if (!wd.zone || (x >= wd.zone.x && x <= wd.zone.x + wd.zone.w && y >= wd.zone.y && y <= wd.zone.y + wd.zone.h))
          this.fx.streak(x, y, wd.dir);
      }
    } else this.windAcc = 0;

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
      if (!ex) {
        ex = new Explorer(this.scene, this.explorerLayer, p.slot);
        this.explorers.set(p.id, ex);
      }
      const q = pos.get(p.id)!;
      ex.update(p, { x: q.x + PLAYER_W / 2, y: q.y + PLAYER_H, zoom: res.state.zoom, dt });
      anchors.set(p.id, { x: q.x + PLAYER_W / 2, y: q.y + PLAYER_H * 0.62 });
      if (p.inGoal && !this.prevInGoal.has(p.id)) ex.celebrate();
    }
    this.prevInGoal = new Set(w.players.filter((p) => p.inGoal).map((p) => p.id));
    for (const [id, ex] of this.explorers)
      if (!seen.has(id)) {
        ex.destroy();
        this.explorers.delete(id);
      }
    this.rope.update(dt, w.ropes, anchors, res.rect, this.t, (px, py) =>
      isSolidKind(tileAt(w.grid, Math.floor(px / TILE), Math.floor(py / TILE))),
    );
    this.ents.update(dt, w.entities, w.players);
    this.dark.update(
      res.rect,
      w.dark ?? null,
      w.players
        .filter((p) => !p.dead && p.connected)
        .map((p) => {
          const q = pos.get(p.id)!;
          return { x: q.x + PLAYER_W / 2, y: q.y + PLAYER_H / 2 };
        }),
      this.t,
    );
    this.hints.update(dt, [...pos.values()]);

    // hud
    const slotById = new Map(w.players.map((p) => [p.id, p.slot]));
    this.hud.update(
      dtMs,
      res.offscreen.map((o) => ({
        id: o.id,
        slot: slotById.get(o.id) ?? 0,
        dirX: o.dirX,
        dirY: o.dirY,
        seconds: this.stragglers.seconds(o.id),
        limit: bubbleSec,
      })),
      new Set(w.players.filter((p) => p.inGoal).map((p) => p.id)),
      w.players.map((p) => ({ id: p.id, slot: p.slot, inGoal: p.inGoal, connected: p.connected })),
    );
    void VIEW_W;
    void VIEW_H;
    void ROPE_LEN;
    void BUBBLE_POP_SEC;
    void medalFor;
  }
}
