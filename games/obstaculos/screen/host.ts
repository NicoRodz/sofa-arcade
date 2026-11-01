// The screen's side of a running expedition: owns the session (the real world at 60 Hz), publishes its obst.* events on the session bus,
// gives the scene the WorldView of the current level and feeds the camera's verdict (who is out of the picture) back to the simulation.
// No DOM and no Phaser: main.ts wires it to the phones and to the scene, the tests drive it directly.
import {
  ObstSession,
  DT,
  TILE,
  levelProgressField,
  type Biome,
  type ObstEvents,
  type ObstEvent,
  type Packet,
  type SessionOpts,
} from '../index';
import type { Emitter } from '@pichi/core';
import type { MusicState } from './audio';
import { SimWorldView } from './render/adapter';
import type { ObstaclesView } from './render/obstacles-view';
import type { WorldView } from './render/view';
import type { LevelEnd } from './campaign/flow';
import type { Appearance } from '@pichi/core/avatar';

type ObstBus = Pick<Emitter<ObstEvents>, 'emit'>;

export interface RunHooks {
  names: (slot: number) => string;
  looks?: (slot: number) => Appearance | undefined; // the player's Appearance (the rig dresses with it)
  bus: ObstBus;
  onOver: () => void; // the final banner has been shown long enough: the screen goes to the results
  onLevelEnd?: (e: LevelEnd) => void; // the campaign saves here, the moment a level is cleared or its hearts run out (not when the banners are over)
}

export class ObstRun {
  readonly session: ObstSession;
  private view: SimWorldView;
  private hooks: RunHooks;
  private shown = '';
  private overSent = false;
  private field: Int32Array;
  private startDist = 1;

  constructor(opts: SessionOpts, hooks: RunHooks) {
    this.hooks = hooks;
    this.session = new ObstSession(opts);
    this.view = new SimWorldView(this.session, this.session.world, hooks.names, hooks.looks);
    this.field = levelProgressField(this.session.world.level);
    this.startDist = this.distAtSpawn();
  }

  private distAtSpawn(): number {
    const w = this.session.world,
      sp = w.level.markers.spawn[0]!;
    return Math.max(1, this.field[sp.y * w.level.w + sp.x]!);
  }

  get biome(): Biome {
    return this.session.world.level.def.biome;
  }
  world(): WorldView {
    return this.view;
  }

  receive(slot: number, p: Packet): void {
    this.session.receive(slot, p);
  }
  setConnected(slot: number, on: boolean): void {
    this.session.setConnected(slot, on);
  }

  // Scene host.step: advance the simulation, publish what happened, refresh the picture.
  step(dtMs: number): void {
    const was = this.session.status;
    const ev = this.session.advance(dtMs);
    this.publish(ev);
    if (was === 'playing' && this.session.status === 'between') this.hooks.onLevelEnd?.(this.levelEnd());
    if (this.session.world !== this.view.world) {
      this.view = new SimWorldView(this.session, this.session.world, this.hooks.names, this.hooks.looks);
      this.field = levelProgressField(this.session.world.level);
      this.startDist = this.distAtSpawn();
    }
    this.view.sync();
    if (this.session.overDue && !this.overSent) {
      this.overSent = true;
      this.hooks.onOver();
    }
  }

  // The level that just ended, as the campaign needs it: the world is still the one that was played (the next one is built after the pause).
  private levelEnd(): LevelEnd {
    const w = this.session.world;
    const cleared = w.status === 'cleared' && !!w.result;
    let mask = 0;
    w.ent.stars.forEach((s, i) => {
      if (s.taken) mask |= 1 << i;
    });
    return {
      cleared,
      timeMs: Math.round((cleared ? w.result!.timeSec : w.tick * DT) * 1000),
      collectiblesMask: cleared ? mask : 0,
      deaths: w.deaths,
    };
  }

  private publish(events: readonly ObstEvent[]): void {
    for (const e of events) (this.hooks.bus.emit as (name: string, data: unknown) => void)(e.name, e.data);
  }

  // Scene host.afterRender: the camera decided who is out of the picture; the world turns that into bubbles (deterministically, by its own clock).
  // Also the 3-2-1 and the level card, which need a live view to draw on.
  afterRender(v: ObstaclesView): void {
    const res = v.camera.result;
    const flags: boolean[] = [];
    if (res)
      for (const o of res.offscreen) {
        const slot = this.view.players.find((p) => p.id === o.id)?.slot;
        if (slot !== undefined) flags[slot] = true;
      }
    this.session.setOffCamera(res ? flags : undefined);
    const s = this.session;
    const once = (key: string, draw: () => void) => {
      if (key !== this.shown) {
        this.shown = key;
        draw();
      }
    };
    const tag = `${s.levelIndex}:${s.run.failures}`;
    if (s.status === 'countdown') {
      const n = Math.ceil(s.countdownMs / 1000);
      if (s.levelIndex === 0 && s.run.failures === 0) once(`count${n}`, () => v.banner(String(n), '#FFD23F', 900, 170));
      else
        once(`card${tag}`, () =>
          v.banner(`${s.run.retrying ? 'OTRA VEZ' : `NIVEL ${s.levelIndex + 1}`}\n${s.world.level.def.name}`, '#FFF4E0', 1900),
        );
    } else if (s.status === 'playing' && s.world.tick < 50 && s.levelIndex === 0 && s.run.failures === 0)
      once('go', () => v.banner('¡VAMOS!', '#7BE08A', 900, 130));
  }

  // What the music needs to know (audio/music.ts MusicState), from the running world.
  musicState(): MusicState {
    const s = this.session,
      w = s.world;
    const act = w.players.filter((p) => p.connected && p.mode === 'active');
    const biome = w.level.def.biome;
    if (!act.length || s.status !== 'playing')
      return {
        biome,
        playing: false,
        progress: 0,
        danger: 0,
        stragglers: 0,
        moving: false,
        checkpointed: false,
        maxRopeTension: 0,
        lavaNear: false,
      };
    const at = (p: (typeof act)[number]) => {
      const x = Math.max(0, Math.min(w.level.w - 1, Math.floor((p.body.x + 17) / TILE))),
        y = Math.max(0, Math.min(w.level.h - 1, Math.floor((p.body.y + 23) / TILE)));
      return this.field[y * w.level.w + x]!;
    };
    const dists = act.map(at).sort((a, b) => a - b);
    const med = dists[Math.floor((dists.length - 1) / 2)]!;
    const hz = w.ent.hazard;
    const lavaNear =
      !!hz &&
      hz.kind !== 'tide' &&
      act.some((p) => (hz.kind === 'risingLava' ? hz.pos - (p.body.y + 46) < 6 * TILE : p.body.x - hz.pos < 8 * TILE));
    let tension = 0;
    for (const r of w.ropes) for (const l of r.links) if (l.active) tension = Math.max(tension, l.tension);
    const down = w.players.filter((p) => p.connected && p.mode !== 'active').length;
    return {
      biome,
      playing: true,
      progress: Math.max(0, Math.min(1, 1 - med / this.startDist)),
      danger: lavaNear ? 0.8 : Math.min(1, w.deaths / 6),
      stragglers: down / Math.max(1, w.players.filter((p) => p.connected).length),
      moving: act.some((p) => Math.abs(p.body.vx) > 30),
      checkpointed: w.activeCheckpoint >= 0,
      maxRopeTension: tension,
      lavaNear,
    };
  }
}
