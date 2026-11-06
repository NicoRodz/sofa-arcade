// The Phaser host with a fake Phaser: one Game for the page with every game's scenes, the scene switch between games (the others are told to leave and sleep, this one wakes
// or starts) and the render scale (r = 2 only for a game that asked, hooked per frame only while it is on screen). Phaser itself needs a canvas, so it is a recorder here.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { H, W } from '../art/tokens';
import type { SceneSpec, ScreenGame } from './game';

const ph = vi.hoisted(() => {
  type Fn = (...a: unknown[]) => void;
  class Emitter {
    on(ev: string, fn: Fn) {
      this.map[ev] = this.map[ev] ?? [];
      this.map[ev].push(fn);
    }
    off(ev: string, fn: Fn) {
      this.map[ev] = (this.map[ev] ?? []).filter((f) => f !== fn);
    }
    emit(ev: string, ...a: unknown[]) {
      for (const f of this.map[ev] ?? []) f(...a);
    }
    count = (ev: string) => (this.map[ev] ?? []).length;
    map: Record<string, Fn[]> = {};
  }
  class Text {
    style = { resolution: 1 };
    setResolution = vi.fn((r: number) => {
      this.style.resolution = r;
    });
  }
  class Game {
    static last: Game;
    events = new Emitter();
    scale = { setGameSize: vi.fn() };
    active = new Set<string>();
    sleeping = new Set<string>();
    log: string[] = [];
    scene = {
      isActive: (k: string) => this.active.has(k),
      isSleeping: (k: string) => this.sleeping.has(k),
      sleep: (k: string) => {
        this.log.push(`sleep:${k}`);
        this.active.delete(k);
        this.sleeping.add(k);
      },
      wake: (k: string) => {
        this.log.push(`wake:${k}`);
        this.sleeping.delete(k);
        this.active.add(k);
      },
      start: (k: string) => {
        this.log.push(`start:${k}`);
        this.active.add(k);
      },
    };
    constructor(public config: { scene: unknown[] }) {
      Game.last = this;
    }
  }
  return { Game, Text };
});
vi.mock('phaser', () => ({
  default: {
    AUTO: 0,
    Scale: { FIT: 1, CENTER_BOTH: 2 },
    Core: { Events: { POST_RENDER: 'post', STEP: 'step', PRE_RENDER: 'pre' } },
    GameObjects: { Text: ph.Text },
    Game: ph.Game,
  },
}));
const flushLag = vi.hoisted(() => vi.fn());
const runFrame = vi.hoisted(() => vi.fn());
const probe = vi.hoisted(() => ({ mark: vi.fn(), start: vi.fn() }));
vi.mock('../net/latency', () => ({ flushLag }));
vi.mock('./frame', () => ({ runFrame }));
vi.mock('./fps-probe', () => ({
  fpsEnabled: () => (globalThis as { location: { search: string } }).location.search.includes('fps=1'),
  startFpsProbe: (f: () => string) => {
    probe.start(f());
    return probe;
  },
}));

const list = vi.hoisted(() => ({ games: [] as ScreenGame[] }));
vi.mock('./game', () => ({
  games: () => ({ list: () => list.games, get: (id: string) => list.games.find((g) => g.manifest.id === id) }),
}));

const cam = () => ({
  zoom: 1,
  originX: 5,
  setOrigin: vi.fn(function (this: any) {
    this.originX = 0;
    return this;
  }),
  setZoom: vi.fn(function (this: any, z: number) {
    this.zoom = z;
    return this;
  }),
});
const spec = (
  key: string,
  extra: Partial<SceneSpec> = {},
): SceneSpec & { camera: ReturnType<typeof cam>; texts: InstanceType<typeof ph.Text>[] } => {
  const camera = cam();
  const texts = [new ph.Text(), new ph.Text()];
  const scene = { sys: { isActive: () => true }, cameras: { main: camera }, children: { list: [...texts, { not: 'text' }] } };
  return { key, scene: scene as never, camera, texts, ...extra };
};
const game = (id: string, scenes?: SceneSpec[], renderScale?: 1 | 2): ScreenGame =>
  ({ manifest: { id } as never, scenes: scenes ? () => scenes : undefined, renderScale }) as unknown as ScreenGame;

let host: typeof import('./game-host');
let setScale: typeof import('./render-scale');
const G = () => ph.Game.last;
const display = (width: number, dpr: number, search = '') => {
  vi.stubGlobal('window', { screen: { width }, devicePixelRatio: dpr });
  vi.stubGlobal('location', { search });
};

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  list.games = [];
  display(1920, 1);
  host = await import('./game-host');
  setScale = await import('./render-scale');
});

describe('createPhaser', () => {
  it('boots one Game with the scenes of every registered game, in order, parented on #game at 1920x1080', () => {
    const a = spec('a1'),
      b = spec('b1'),
      b2 = spec('b2');
    list.games = [game('a', [a]), game('b', [b, b2]), game('c')];
    expect(host.createPhaser()).toBe(G());
    expect(host.phaserGame()).toBe(G());
    expect(G().config.scene).toEqual([a.scene, b.scene, b2.scene]);
    expect(G().config).toMatchObject({ parent: 'game', scale: { width: W, height: H } });
  });
  it('each frame (STEP) runs the active game with the delta, and the lag counters flush after render', () => {
    list.games = [game('a', [spec('a1')])];
    host.createPhaser();
    G().events.emit('step', 1234, 16.5);
    expect(runFrame).toHaveBeenCalledWith(16.5);
    G().events.emit('post');
    expect(flushLag).toHaveBeenCalledTimes(1);
  });
  it('without ?fps=1 no probe runs: the hot path is untouched', () => {
    list.games = [];
    host.createPhaser();
    expect(probe.start).not.toHaveBeenCalled();
    expect(G().events.count('step')).toBe(1);
  });
  it('with ?fps=1 the probe starts, labelled with the render scale, and gets the vsync timestamp of every STEP', () => {
    display(1920, 1, '?fps=1');
    host.createPhaser();
    expect(probe.start).toHaveBeenCalledWith('r1');
    expect(G().events.count('step')).toBe(2);
    G().events.emit('step', 999, 16);
    expect(probe.mark).toHaveBeenCalledWith(999);
  });
});

describe('showScene: the switch between games', () => {
  const two = () => {
    const a = spec('a1', { leave: vi.fn() }),
      b = spec('b1', { leave: vi.fn() }),
      b2 = spec('b2');
    list.games = [game('a', [a]), game('b', [b, b2])];
    host.createPhaser();
    return { a, b, b2 };
  };
  it("the other games' running scenes are told to leave and put to sleep; the new game's scenes start", () => {
    const { a, b } = two();
    G().active.add('a1');
    host.showScene('b');
    expect(a.leave).toHaveBeenCalledTimes(1);
    expect(G().log).toEqual(['sleep:a1', 'start:b1', 'start:b2']);
    expect(b.leave).not.toHaveBeenCalled();
  });
  it('a scene that was sleeping is woken, not started again', () => {
    two();
    G().sleeping.add('b1');
    host.showScene('b');
    expect(G().log).toEqual(['wake:b1', 'start:b2']);
  });
  it('an already running scene of the game is left alone', () => {
    two();
    G().active.add('b1');
    host.showScene('b');
    expect(G().log).toEqual(['start:b2']);
  });
  it('the scene Phaser boots with (initial) is never started by the shell', () => {
    const a = spec('a1', { initial: true });
    list.games = [game('a', [a])];
    host.createPhaser();
    host.showScene('a');
    expect(G().log).toEqual([]);
  });
  it('a sleeping scene of another game is told to leave but not slept twice; an idle one is not touched', () => {
    const { a, b } = two();
    G().sleeping.add('a1');
    host.showScene('b');
    expect(a.leave).toHaveBeenCalledTimes(1);
    expect(G().log).not.toContain('sleep:a1');
    host.showScene('a'); // b1 and b2 were started above: they leave now, a1 wakes
    expect(b.leave).toHaveBeenCalledTimes(1);
    expect(G().log).toContain('wake:a1');
  });
  it('showing a game the host does not know only puts the others to sleep', () => {
    two();
    G().active.add('a1');
    host.showScene('zzz');
    expect(G().log).toEqual(['sleep:a1']);
  });
});

describe('the render scale', () => {
  it('a game that never asked stays at 1 on any display: no resize, no per-frame hook', () => {
    display(3840, 2);
    list.games = [game('a', [spec('a1')])];
    host.createPhaser();
    host.showScene('a');
    expect(G().scale.setGameSize).not.toHaveBeenCalled();
    expect(G().events.count('pre')).toBe(0);
  });
  it('an opted-in game on a 4K display doubles the backbuffer and hooks the per-frame fit', () => {
    display(3840, 1);
    const m = spec('m1');
    list.games = [game('m', [m], 2)];
    host.createPhaser();
    host.showScene('m');
    expect(G().scale.setGameSize).toHaveBeenCalledWith(W * 2, H * 2);
    expect(setScale.renderScale()).toBe(2);
    expect(G().events.count('pre')).toBe(1);
    G().events.emit('pre');
    expect(m.camera.setOrigin).toHaveBeenCalledWith(0, 0);
    expect(m.camera.setZoom).toHaveBeenCalledWith(2);
    expect(m.texts.map((t) => t.style.resolution)).toEqual([2, 2]);
  });
  it('on a small display or with ?render=1 the opted-in game stays at 1', () => {
    display(1920, 1);
    list.games = [game('m', [spec('m1')], 2)];
    host.createPhaser();
    host.showScene('m');
    expect(G().scale.setGameSize).not.toHaveBeenCalled();
    display(3840, 1, '?render=1');
    host.showScene('m');
    expect(G().scale.setGameSize).not.toHaveBeenCalled();
  });
  it('?render=2 forces 2 on a small display', () => {
    display(1280, 1, '?render=2');
    list.games = [game('m', [spec('m1')], 2)];
    host.createPhaser();
    host.showScene('m');
    expect(G().scale.setGameSize).toHaveBeenCalledWith(W * 2, H * 2);
  });
  it('switching to a game that did not ask returns to 1, unhooks the frame fit and resets the camera once', () => {
    display(3840, 1);
    const m = spec('m1'),
      p = spec('p1');
    list.games = [game('m', [m], 2), game('p', [p])];
    host.createPhaser();
    host.showScene('m');
    host.showScene('p');
    expect(G().scale.setGameSize).toHaveBeenLastCalledWith(W, H);
    expect(setScale.renderScale()).toBe(1);
    expect(G().events.count('pre')).toBe(0);
    expect(m.camera.setZoom).toHaveBeenLastCalledWith(1); // fitScenes ran once at r = 1: the opted-in scene gets its zoom back
    expect(m.texts.map((t) => t.style.resolution)).toEqual([1, 1]);
  });
  it('showing the same scale twice does not resize or double-hook', () => {
    display(3840, 1);
    list.games = [game('m', [spec('m1')], 2)];
    host.createPhaser();
    host.showScene('m');
    host.showScene('m');
    expect(G().scale.setGameSize).toHaveBeenCalledTimes(1);
    expect(G().events.count('pre')).toBe(1);
  });
  it('the per-frame fit skips scenes that are not active and cameras already right', () => {
    display(3840, 1);
    const idle = spec('i1');
    (idle.scene as unknown as { sys: { isActive: () => boolean } }).sys.isActive = () => false;
    const ok = spec('o1');
    ok.camera.zoom = 2;
    ok.camera.originX = 0;
    ok.texts.forEach((t) => (t.style.resolution = 2));
    list.games = [game('m', [idle, ok], 2)];
    host.createPhaser();
    host.showScene('m');
    G().events.emit('pre');
    expect(idle.camera.setZoom).not.toHaveBeenCalled();
    expect(ok.camera.setZoom).not.toHaveBeenCalled();
    expect(ok.texts[0]!.setResolution).not.toHaveBeenCalled();
  });
});
