import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import QRCode from 'qrcode';
import { attachRelay } from './relay.js';
import { lanIp } from './lan.js';
import { ExpeditionStore } from './expeditions.js';
import { mountExpeditions } from './expeditionsApi.js';

export type Mode = 'none' | 'dev' | 'static';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const area = (p: string) => (req: express.Request) => req.path === p || req.path.startsWith(p + '/');

export async function startServer(opts: { port: number; mode: Mode; dataDir?: string }) {
  const app = express();
  const server = createServer(app);
  const relay = attachRelay(server);
  const closers: (() => Promise<unknown>)[] = [];

  app.get('/', (_req, res) => res.redirect('/screen'));
  // Campaign progress of "Obstaculos en cadena": one JSON per expedition under data/ (override with PG_DATA_DIR or opts.dataDir).
  let expeditions: ExpeditionStore | undefined;
  mountExpeditions(app, () => (expeditions ??= new ExpeditionStore({ dir: opts.dataDir ?? process.env.PG_DATA_DIR ?? path.join(root, 'data', 'expeditions') })));

  app.get('/api/info', async (req, res) => {
    const port = req.socket.localPort ?? opts.port;
    const room = typeof req.query.room === 'string' ? req.query.room.slice(0, 16) : '';
    const url = `http://${lanIp()}:${port}/c${room ? `?room=${encodeURIComponent(room)}` : ''}`;
    const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } });
    res.json({ url, qrSvg });
  });

  if (opts.mode === 'dev') {
    const { createServer: createVite } = await import('vite');
    const mk = async (dir: string) => {
      const v = await createVite({
        root: path.join(root, dir),
        configFile: path.join(root, dir, 'vite.config.ts'),
        server: { middlewareMode: true, hmr: false, ws: false },
        appType: 'spa',
      });
      closers.push(() => v.close());
      return v;
    };
    const screen = await mk('screen');
    const ctrl = await mk('controller');
    app.use((req, res, next) => {
      if (area('/screen')(req)) return screen.middlewares(req, res, next);
      if (area('/c')(req)) return ctrl.middlewares(req, res, next);
      next();
    });
  } else if (opts.mode === 'static') {
    app.use('/screen', express.static(path.join(root, 'screen/dist')));
    app.use('/c', express.static(path.join(root, 'controller/dist')));
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, '0.0.0.0', resolve);
  });
  const port = (server.address() as { port: number }).port;

  return {
    port,
    relay,
    async close() {
      for (const c of closers) await c();
      for (const ws of relay.wss.clients) ws.terminate();
      relay.wss.close();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
