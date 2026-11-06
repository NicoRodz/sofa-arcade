// Join-only phones: they connect to a room under the player names of the capture tools and never send input, so the screen holds still until the test moves it.
import { WebSocket } from 'ws';

const NAMES = ['Nico', 'Angi', 'Pablo', 'Mati', 'Coni', 'Rafa', 'Vale', 'Tomás'];

export class Phones {
  private sockets: WebSocket[] = [];
  private joined: Promise<void>[] = [];
  constructor(
    private port: number,
    private room: string,
  ) {}
  /** Joins n phones one after the other (so the player ids are always in the same order); resolves once the relay confirmed every one. */
  async join(n: number) {
    for (let slot = 0; slot < n; slot++) {
      const ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws?room=${this.room}`);
      this.sockets.push(ws);
      const done = new Promise<void>((resolve, reject) => {
        ws.on('error', reject);
        ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: NAMES[slot], token: `bot-${this.room}-${slot}` })));
        ws.on('message', (d) => {
          if (JSON.parse(d.toString()).t !== 'joined') return;
          ws.send(JSON.stringify({ t: 'schoolDone' })); // else the first "A cocinar" offers the Cocina escuela
          resolve();
        });
      });
      this.joined.push(done);
      await done;
    }
  }
  close() {
    for (const ws of this.sockets.splice(0)) ws.close();
  }
}
