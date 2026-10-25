// The screen's WebSocket to the relay and the one function everything uses to send. A leaf module: the shell, the games and the
// connection logic all import it, it imports nothing from them.
import type { ClientMsg } from '@pichi/core';

let ws: WebSocket | undefined;
export const setSocket = (s: WebSocket) => {
  ws = s;
};
export const socket = () => ws;
export const sendMsg = (m: ClientMsg) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
};
