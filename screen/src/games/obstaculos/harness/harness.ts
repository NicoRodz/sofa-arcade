// Visual harness for the renderer: a Phaser game with FakeWorld (real F1 physics, bots or keyboard). Served by vite from screen/.
// usage: window.obst.start({ level: 1, n: 8, mode: 'chain', bots: true }) ; ff(seconds) fast-forwards ; see tools/obst-capture.ts
import Phaser from 'phaser';
import { Emitter } from '@party/shared/events';
import type { Biome, GameMode, ObstEvents } from '@party/shared/obstaculos';
import type { Difficulty } from '@party/shared/difficulty';
import { LEVELS } from '../../../../../shared/games/obstaculos/levels';
import { H, W } from '../../../art/tokens';
import { ObstaclesScene } from '../render/scene';
import { FakeWorld, botController, type Controller } from '../render/stub';
import type { WorldView } from '../render/view';

const bus = new Emitter<ObstEvents>();
let world: FakeWorld | null = null;
let idle = new Set<number>();
let bots = true;
const keys = new Set<string>();
const frameStats = { frames: 0, cpuMs: 0, updMs: 0, dts: [] as number[], last: 0 };
addEventListener('keydown', (e) => { keys.add(e.code); });
addEventListener('keyup', (e) => { keys.delete(e.code); });
const justPressed = new Set<string>();
addEventListener('keydown', (e) => { if (!e.repeat) justPressed.add(e.code); });

const botCtl = (): Controller => botController({ idle });
let bot: Controller = botCtl();
const keyboard: Controller = (i, w) => {
  if (i === 0) {
    const jump = justPressed.delete('Space') || justPressed.delete('ArrowUp');
    return { move: (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), down: keys.has('ArrowDown'), jump, grab: keys.has('KeyZ') };
  }
  if (i === 1) {
    const jump = justPressed.delete('KeyW');
    return { move: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), down: keys.has('KeyS'), jump, grab: keys.has('KeyE') };
  }
  return bot(i, w);
};

const scene = new ObstaclesScene({
  step: (ms) => { if (!world) return; world.controller = bots ? bot : keyboard; world.advance(ms); justPressed.clear(); },
  world: () => world as WorldView | null,
  afterRender: (v) => { world?.requestBubbles(v.bubbleDue); },
}, bus);

const origUpdate = scene.update.bind(scene);
scene.update = (t: number, d: number) => { const a = performance.now(); origUpdate(t, d); frameStats.updMs += performance.now() - a; };
const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', backgroundColor: '#3A2A24',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
  fps: { target: 60 }, scene,
});
game.events.on(Phaser.Core.Events.POST_STEP, () => { frameStats.last = performance.now(); });
game.events.on(Phaser.Core.Events.POST_RENDER, () => {
  const now = performance.now();
  frameStats.frames++; frameStats.cpuMs += now - frameStats.last;
  if (frameStats.dts.length < 4000) frameStats.dts.push(now - (frameStats as unknown as { prev?: number }).prev! || 0);
  (frameStats as unknown as { prev?: number }).prev = now;
});

interface StartOpts { long?: boolean; level?: number; n?: number; mode?: GameMode; difficulty?: Difficulty; bots?: boolean; idle?: number[]; biome?: Biome }
const api = {
  start(o: StartOpts = {}) {
    const def0 = LEVELS[(o.level ?? 1) === 1 ? 0 : (o.level ?? 1) === 4 ? 1 : 2]!;
    let def = o.biome ? { ...def0, biome: o.biome } : def0;
    if (o.long) { // level 1 repeated twice (a 118-column level): far enough apart that the picture cannot hold everybody at the minimum zoom
      const mid = def0.rows.map((r) => r.slice(1, -1));
      const rows = def0.rows.map((r, y) => '#' + mid[y]!.replace('G', '.') + mid[y]!.replace('S', '.') + '#');
      def = { ...def, rows, hints: [] };
    }
    idle = new Set(o.idle ?? []); bots = o.bots ?? true; bot = botCtl();
    world = new FakeWorld(def, o.n ?? 4, o.mode ?? 'chain', o.difficulty ?? 'normal', bus);
    return true;
  },
  world: () => world,
  scene, game, bus,
  // fast-forward: steps the world and the view as if frames of 1/60 s went by
  ff(seconds: number) {
    if (!world || !scene.view) return false;
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) { world.controller = bots ? bot : keyboard; world.advance(1000 / 60); scene.view.update(1000 / 60); world.requestBubbles(scene.view.bubbleDue); }
    return true;
  },
  stats: () => ({ frames: frameStats.frames, cpuMs: frameStats.cpuMs, updMs: frameStats.updMs }),
  resetStats() { frameStats.frames = 0; frameStats.cpuMs = 0; frameStats.updMs = 0; frameStats.dts = []; (frameStats as unknown as { prev?: number }).prev = undefined; },
  frameDts: () => frameStats.dts.slice(),
  setIdle(ids: number[]) { idle = new Set(ids); bot = botCtl(); },
};
(window as unknown as { obst: typeof api }).obst = api;
