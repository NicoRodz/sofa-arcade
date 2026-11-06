// Support for the relay tests over real websockets: one server per test file (`useRelayServer`), a phone/screen `Client`, and small helpers.
import { afterAll, beforeAll } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '@pichi/core';
import { startServer } from '../src/server';

export const kit: { srv: Awaited<ReturnType<typeof startServer>> } = { srv: undefined as never };

export function useRelayServer() {
  beforeAll(async () => {
    kit.srv = await startServer({ port: 0, mode: 'none' });
  });
  afterAll(async () => {
    await kit.srv.close();
  });
}

export class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  constructor(query = '') {
    this.ws = new WebSocket(`ws://127.0.0.1:${kit.srv.port}/ws${query}`);
    this.ws.on('message', (d) => this.msgs.push(JSON.parse(d.toString())));
  }
  open() {
    return new Promise<void>((r) => this.ws.once('open', () => r()));
  }
  send(m: ClientMsg | string) {
    this.ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  }
  async next<T extends ServerMsg['t']>(t: T): Promise<Extract<ServerMsg, { t: T }>> {
    // setImmediate + Date.now: keeps working while setTimeout is faked
    const end = Date.now() + 2000;
    while (Date.now() < end) {
      const j = this.msgs.findIndex((m) => m.t === t);
      if (j >= 0) return this.msgs.splice(j, 1)[0] as Extract<ServerMsg, { t: T }>;
      await new Promise((r) => setImmediate(r));
    }
    throw new Error(`timeout waiting for ${t}; got ${JSON.stringify(this.msgs)}`);
  }
}

export const input = (n: number, presses = 0): ClientMsg => ({
  t: 'input',
  seq: n,
  x: 0.5,
  y: -1,
  btn: 0,
  presses: [presses],
  ts: Date.now(),
});

export const settle = async () => {
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
};
