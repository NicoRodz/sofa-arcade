// Hosts the games' Phaser scenes: one Phaser.Game for the page, created with the scenes every registered game declares, and the switch
// between them (the scene of a game sleeps while another one runs). Moved out of apps/screen/src/main.ts (F4b): `showScene('main' | 'obst')` became
// showScene(gameId); the Obstaculos-only steps are the scene's `leave` hook.
import Phaser from 'phaser';
import { C, H, W } from '../art/tokens';
import { flushLag } from '../net/latency';
import { games, type SceneSpec } from './game';
import { runFrame } from './frame';
import { fpsEnabled, startFpsProbe } from './fps-probe';
import { pickRenderScale, renderOverride, renderScale, setCurrentRenderScale } from './render-scale';

let phaser: Phaser.Game | undefined;
const byGame = new Map<string, SceneSpec[]>();
export const phaserGame = () => phaser!;

export function createPhaser() {
  const specs: SceneSpec[] = [];
  for (const g of games().list()) {
    const mine = g.scenes?.() ?? [];
    byGame.set(g.manifest.id, mine);
    specs.push(...mine);
  }
  phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: C.cocoa,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
    fps: { target: 60 },
    scene: specs.map((s) => s.scene),
  });
  phaser.events.on(Phaser.Core.Events.POST_RENDER, flushLag);
  phaser.events.on(Phaser.Core.Events.STEP, (_time: number, delta: number) => runFrame(delta)); // before the scenes update: the active game's logic, then its scene draws it
  phaser.events.on(Phaser.Core.Events.PRE_RENDER, fitScenes); // after the scenes updated, before they draw: a scene created this frame is already there
  if (fpsEnabled()) {
    const probe = startFpsProbe(() => `r${renderScale()}`);
    phaser.events.on(Phaser.Core.Events.STEP, (time: number) => probe.mark(time)); // the vsync-aligned rAF timestamp, not a clock read inside the callback (that adds jitter)
  }
  return phaser;
}

/** F6: the backbuffer of the game about to be shown. 1920x1080 unless the game opted in (ScreenGame.renderScale) and the display or `?render=2` asks for more. */
function applyRenderScale(gameId: string) {
  const want = games().get(gameId)?.renderScale ?? 1;
  const r = pickRenderScale({ want, override: renderOverride(), screenWidth: window.screen.width, dpr: window.devicePixelRatio });
  if (r === renderScale()) return;
  setCurrentRenderScale(r);
  phaser!.scale.setGameSize(W * r, H * r); // the canvas element is now W*r x H*r; FIT still stretches it to the window
}

/** At r = 2 the logical 1920x1080 still is what a scene draws: its camera zooms from the top-left corner and its texts rasterise at 2x. Every frame, so nothing depends on when a scene is created. */
function fitScenes() {
  const r = renderScale();
  if (r === 1) return;
  for (const g of games().list()) {
    if (!g.renderScale) continue;
    for (const s of byGame.get(g.manifest.id) ?? []) {
      if (!s.scene.sys.isActive()) continue;
      const cam = s.scene.cameras.main;
      if (cam.zoom !== r || cam.originX !== 0) cam.setOrigin(0, 0).setZoom(r);
      for (const o of s.scene.children.list) if (o instanceof Phaser.GameObjects.Text && o.style.resolution !== r) o.setResolution(r);
    }
  }
}

/** Show the scenes of this game: the other games' scenes leave (they are told, then put to sleep), this one wakes (or starts, the first time). */
export function showScene(gameId: string) {
  applyRenderScale(gameId);
  const sm = phaser!.scene;
  for (const [id, specs] of byGame)
    if (id !== gameId)
      for (const s of specs) {
        if (sm.isActive(s.key) || sm.isSleeping(s.key)) s.leave?.();
        if (sm.isActive(s.key)) sm.sleep(s.key);
      }
  for (const s of byGame.get(gameId) ?? []) {
    if (sm.isSleeping(s.key)) sm.wake(s.key);
    else if (!s.initial && !sm.isActive(s.key)) sm.start(s.key);
  }
}
