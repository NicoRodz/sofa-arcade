// The Captain's phone: a ws client that reads the menu form the relay sends it and answers with menuAct.
import { WebSocket } from 'ws';
import { PORT } from '../capture/config';

export class Captain {
  ws: WebSocket;
  id = 0;
  rev = 0;
  rows: any[] = [];
  constructor(room: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${room}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', name: 'Cap', token: `cap-${room}`, caps: ['menu1'] })));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === 'joined') {
        this.id = m.player.id;
        this.ws.send(JSON.stringify({ t: 'schoolDone' }));
      }
      if (m.t === 'menu') {
        this.rev = m.rev;
        this.rows = m.rows;
      }
    });
  }
  act(row: string, value: string | boolean) {
    this.ws.send(JSON.stringify({ t: 'menuAct', rev: this.rev, act: 'set', row, value }));
  }
  /** an enabled map of the Captain's form that is not the current one */
  otherMap(): string | undefined {
    const r = this.rows.find((x) => x.id === 'map');
    const all = [...(r?.options ?? []), ...(r?.groups ?? []).flatMap((g: any) => g.items)];
    return all.find(
      (o: any) => o.enabled && o.id !== r.value && !['auto', 'random', 'V-auto', 'V-random'].includes(o.id) && /^[A-Za-z0-9]+$/.test(o.id),
    )?.id;
  }
}
