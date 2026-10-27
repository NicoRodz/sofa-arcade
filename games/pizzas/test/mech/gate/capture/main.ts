// Capture page of the T1b mechanics (test support, not shipped): a Phaser scene that draws the REAL kitchen background of the game and the REAL art views (GateView, BeltReverseView, OvenHeatView)
// over a sim that the golden chefs play (with each mechanic's bot job). `window.__cap.advance(n)` runs n ticks; `window.__cap.info()` reads the state; the runner takes the screenshots.
import Phaser from 'phaser';
import { COUNTDOWN_MS, addPlayer, createGame, tick, type Controls, type Game } from '../../../../sim/overcooked';
import { mechFlagsOf, type MechId } from '../../../../sim/mech/ids';
import { buildBackground } from '../../../../screen/art/env';
import { GateView } from '../../../../screen/art/mech/gate/draw';
import { BeltReverseView } from '../../../../screen/art/mech/beltReverse/draw';
import { OvenHeatView } from '../../../../screen/art/mech/ovenHeat/draw';
import { decide, type Mem } from '../../../golden/bot';
import { gateAssist, newGateBot } from '../../../../../../tools/carta-larga/mech/gate';
import { GATE_ROWS } from '../map';
import { BELT_ROWS } from '../../beltReverse/map';
import { HEAT_ROWS } from '../../ovenHeat/map';
import { OX, OY, TILE } from '@pichi/screen-kit/art/tokens';

const id = new URLSearchParams(location.search).get('mech') as 'gate' | 'beltReverse' | 'ovenHeat';
const ROWS = { gate: GATE_ROWS, beltReverse: BELT_ROWS, ovenHeat: HEAT_ROWS }[id];
const N = 4;

let game: Game;
const mem = new Map<number, Mem>();
const gateBot = newGateBot();
let t = 0;

function advance(k: number) {
  for (let i = 0; i < k; i++, t++) {
    const controls = new Map<number, Controls>();
    [...game.players.keys()].forEach((pid, rank) => controls.set(pid, decide(game, game.players.get(pid)!, rank, mem.get(pid)!, t)));
    if (id === 'gate') gateAssist(game, controls, gateBot, t);
    tick(game, controls);
  }
}

class Cap extends Phaser.Scene {
  private chefs!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  create() {
    game = createGame({
      rows: ROWS,
      n: N,
      seed: 3,
      countdownMs: COUNTDOWN_MS,
      mech: mechFlagsOf([id as MechId]),
      surfaces: ROWS.some((r) => /[→←↑↓]/.test(r)),
    });
    for (let i = 1; i <= N; i++) {
      addPlayer(game, i, i - 1, i - 1);
      mem.set(i, { step: 0, since: 0, lastPress: -99, bin: false });
    }
    buildBackground(this, game.grid, '1', 1);
    if (id === 'gate') new GateView(this, game);
    if (id === 'beltReverse') new BeltReverseView(this, game);
    if (id === 'ovenHeat') new OvenHeatView(this, game);
    this.chefs = this.add.graphics().setDepth(5);
    for (let i = 1; i <= N; i++)
      this.labels.push(this.add.text(0, 0, String(i), { fontSize: '30px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(6));
    advance(Math.ceil(COUNTDOWN_MS / 16.67) + 2);
  }
  update() {
    const g = this.chefs;
    g.clear();
    [...game.players.values()].forEach((p, i) => {
      const x = OX + p.x * TILE,
        y = OY + p.y * TILE;
      g.fillStyle(0x000000, 0.25).fillEllipse(x, y + TILE * 0.28, TILE * 0.7, TILE * 0.25);
      g.fillStyle([0xe63b2e, 0x3fa34d, 0x4aa3ff, 0xffd23f][i % 4]!, 1).fillCircle(x, y, TILE * 0.32);
      g.lineStyle(3, 0x2b1b17, 1).strokeCircle(x, y, TILE * 0.32);
      if (p.item) g.fillStyle(0xfff4e0, 1).fillCircle(x + TILE * 0.22, y - TILE * 0.22, TILE * 0.1);
      this.labels[i]!.setPosition(x, y);
    });
  }
}
new Phaser.Game({
  type: Phaser.CANVAS,
  width: 1920,
  height: 1080,
  parent: 'game',
  scene: Cap,
  backgroundColor: '#3A2A24',
  fps: { target: 60 },
});
(window as unknown as { __cap: unknown }).__cap = {
  advance,
  info: () => ({
    t,
    mech: game?.mech && { gate: game.mech.gate, belt: game.mech.belt, heat: game.mech.heat },
    chefs: [...game.players.values()].map((p) => [p.id, +p.x.toFixed(2), +p.y.toFixed(2)]),
  }),
  until: (what: string, max = 20000) => {
    for (let i = 0; i < max; i++) {
      const m = game.mech!;
      const hit =
        what === 'open'
          ? m.gate?.open
          : what === 'closed'
            ? m.gate?.open === false && t > 600
            : what === 'warn'
              ? (m.belt?.next ?? 9999) < 100
              : what === 'flipped'
                ? m.belt?.reversed
                : what === 'cold'
                  ? Math.min(...Object.values(m.heat ?? { 0: 1000 })) < 800
                  : false;
      if (hit) return t;
      advance(1);
    }
    return -1;
  },
};
