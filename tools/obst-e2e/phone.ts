import { WebSocket } from 'ws';
import { ObstBot, type BotView } from '@pichi/game-obstaculos';
import { PORT } from './config';
import type { ObstState } from './state';

// A phone: joins, sends its stick and counters at 30 Hz, and (optionally) delays and jitters the packets like a bad wifi.
export class Phone {
  ws: WebSocket;
  id = 0;
  seq = 0;
  a = 0;
  b = 0;
  vec = { x: 0, y: 0 };
  bot: ObstBot;
  level = '';
  sent = 0;
  constructor(
    readonly slot: number,
    name: string,
    room: string,
    readonly lag: boolean,
  ) {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${room}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', name, token: `obst-${room}-${slot}` })));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === 'joined') this.id = m.player.id;
    });
    this.bot = new ObstBot(slot);
  }
  startSending() {
    setInterval(() => {
      if (this.ws.readyState !== WebSocket.OPEN) return;
      const msg = JSON.stringify({
        t: 'input',
        seq: this.seq++,
        x: this.vec.x,
        y: this.vec.y,
        btn: 0,
        presses: [this.a, this.b],
        ts: Date.now(),
      });
      const delay = this.lag ? (Math.random() < 0.02 ? 370 : Math.max(0, 150 + (Math.random() - 0.5) * 120)) : 0; // 150 +- 60 ms with a spike now and then
      this.sent++;
      if (delay)
        setTimeout(() => {
          if (this.ws.readyState === WebSocket.OPEN) this.ws.send(msg);
        }, delay);
      else this.ws.send(msg);
    }, 33).unref();
  }
  think(state: ObstState, grid: { w: number; h: number; cells: Uint8Array } | null) {
    if (!grid || state.sess !== 'playing') {
      this.vec = { x: 0, y: 0 };
      return;
    }
    if (state.level !== this.level) {
      this.level = state.level;
      this.bot.reset();
    }
    const view: BotView = { tick: state.tick, grid, players: state.players, goal: state.goal };
    const o = this.bot.decide(view);
    this.vec = { x: o.x, y: o.y };
    if (o.jump) this.a++;
    if (o.grab) this.b++;
  }
  close() {
    this.ws.close();
  }
}
