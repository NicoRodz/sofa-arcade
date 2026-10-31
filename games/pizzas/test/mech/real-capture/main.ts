// Capture of the map mechanics on the REAL screen scene (test support, not shipped): MainScene with the whole World (background, station views, chefs, MechViews, MutateView) over a sim that the golden chefs play.
// `window.__cap.advance(n)` runs n ticks, `act(name)` sets up a situation (a fire, a worn bridge...), `info()` reads the state; run.ts takes the screenshots.
import Phaser from 'phaser';
import type { PublicPlayer } from '@pichi/core';
import { COUNTDOWN_MS, addPlayer, createGame, tick, type Controls, type Game } from '../../../sim/overcooked';
import { mechFlagsOf, type MechId } from '../../../sim/mech/ids';
import { mechOnFire } from '../../../sim/mech/loop';
import { FIRE, OIL, setTile } from '../../../sim/mech/oil/state';
import { wear } from '../../../sim/mech/bridge/module';
import { heads } from '../../../sim/mech/sprinkler/module';
import { liveOf } from '../../../sim/mech/mutation/module';
import { MainScene, type Host } from '../../../screen/scene';
import { pizzasBus } from '@pichi/game-pizzas/screen/bus';
import { decide, type Mem } from '../../golden/bot';
import { OIL_ROWS } from '../oil/map';
import { BRIDGE_ROWS } from '../bridge/map';
import { RAFT_ROWS } from '../raft/map';
import { ONEWAY_ROWS } from '../oneWay/map';
import { MUT, MUT_ROWS } from '../mutation/map';
import { GATE_ROWS } from '../gate/map';
import { KNEADER_ROWS } from '../kneader/map';
import { WOOD_ROWS } from '../woodOven/map';
import { TALLER_MAPS } from '../../../sim/maps';
import { usesSurfaces } from '../../../sim/surfaces/legend';

const SCEN: Record<string, { rows: readonly string[]; mech: MechId[]; mutation?: typeof MUT }> = {
  oil: { rows: OIL_ROWS, mech: ['oil', 'sprinkler'] },
  bridge: { rows: BRIDGE_ROWS, mech: ['bridge'] },
  raft: { rows: RAFT_ROWS, mech: ['raft'] },
  oneWay: { rows: ONEWAY_ROWS, mech: ['oneWay'] },
  mutation: { rows: MUT_ROWS, mech: ['mutation'], mutation: MUT },
  gate: { rows: GATE_ROWS, mech: ['gate'] },
  kneader: { rows: KNEADER_ROWS, mech: ['kneader'] },
  woodOven: { rows: WOOD_ROWS, mech: ['woodOven'] },
  // the Taller series, as the lobby plays it: ?mech=taller29 ... taller36
  ...Object.fromEntries(
    TALLER_MAPS.map((m) => [`taller${m.id}`, { rows: m.rows, mech: [...m.mechanics!], mutation: m.mutation as typeof MUT | undefined }]),
  ),
};
const id = new URLSearchParams(location.search).get('mech')!;
const sc = SCEN[id]!;
const N = 4;
const players = new Map<number, PublicPlayer>();
for (let i = 1; i <= N; i++) players.set(i, { id: i, name: `Chef ${i}`, color: '#fff', slot: i - 1, connected: true, teamId: null });

let game: Game;
const mem = new Map<number, Mem>();
let t = 0;
function advance(k: number) {
  for (let i = 0; i < k; i++, t++) {
    const controls = new Map<number, Controls>();
    [...game.players.keys()].forEach((pid, rank) => controls.set(pid, decide(game, game.players.get(pid)!, rank, mem.get(pid)!, t)));
    tick(game, controls);
  }
}
const host: Host = { step: () => {}, players: () => players, puestos: () => new Map() };
const idx = (x: number, y: number) => y * 16 + x;

const acts: Record<string, () => void> = {
  oil: () => advance(800),
  fire: () => {
    for (const p of game.players.values()) Object.assign(p, { x: 2.5 + p.id * 0.2, y: 6.5 }); // nobody under the flames
    for (const x of [10, 11, 12]) setTile(game, idx(x, 3), OIL, 1800);
    const o = game.stations.find((s) => s.kind === 'pot')!;
    mechOnFire(game, o, 'start');
    advance(100);
  },
  spray: () => {
    setTile(game, idx(4, 4), OIL, 0);
    for (let i = 0; i < 3000 && !heads(game)[0]!.on; i++) advance(1);
    advance(40);
  },
  worn: () => {
    wear(game, idx(7, 2), 5);
    advance(2);
  },
  broken: () => {
    wear(game, idx(7, 2), 6);
    Object.assign(game.players.get(1)!, { x: 3.5, y: 6.5 });
    advance(5);
  },
  mid: () => advance(100),
  warn: () => {
    while (liveOf(game)!.tick < (sc.mutation ?? MUT).at - (sc.mutation ?? MUT).warn + 25) advance(1);
  },
  after: () => {
    while (liveOf(game)!.tick < (sc.mutation ?? MUT).at + 120) advance(1);
  },
  still: () => advance(30),
};

new Phaser.Game({
  type: Phaser.CANVAS,
  width: 1920,
  height: 1080,
  parent: 'game',
  scene: new MainScene(host),
  backgroundColor: '#3A2A24',
  fps: { target: 60 },
  callbacks: {
    postBoot: (g) => {
      const scene = g.scene.getScene('main') as MainScene;
      const start = () => {
        game = createGame({
          rows: sc.rows,
          n: N,
          seed: 3,
          countdownMs: COUNTDOWN_MS,
          mech: mechFlagsOf(sc.mech),
          mutation: sc.mutation,
          surfaces: usesSurfaces(sc.rows),
          events: false,
          bus: pizzasBus, // the scene listens on it: the mutation's repaint and banner come from its events
        });
        for (let i = 1; i <= N; i++) {
          addPlayer(game, i, i - 1, i - 1);
          mem.set(i, { step: 0, since: 0, lastPress: -99, bin: false });
        }
        scene.startRound(game, '1', 1);
        advance(Math.ceil(COUNTDOWN_MS / 16.67) + 2);
      };
      const wait = setInterval(() => {
        if (!scene.sys.isActive() || !scene.textures.exists('chef_shadow')) return;
        clearInterval(wait);
        start();
      }, 100);
    },
  },
});
(window as unknown as { __cap: unknown }).__cap = {
  ready: () => !!game,
  advance,
  act: (name: string) => acts[name]!(),
  info: () => ({
    t,
    chefs: [...game.players.values()].map((p) => [p.id, +p.x.toFixed(1), +p.y.toFixed(1)]),
    live: liveOf(game)?.phase,
    tiles: game.mech?.tile?.reduce((n, v) => n + (v ? 1 : 0), 0),
    raft: game.mech?.raft,
    bridge: game.mech?.bridge,
  }),
};
void FIRE;
