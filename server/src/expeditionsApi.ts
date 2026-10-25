// The HTTP side of the campaign's saved progress (plan §6: "API simple del servidor"). JSON in, JSON out, under /api/expeditions.
//   GET    /api/expeditions                       -> { expeditions: ExpeditionSummary[] }
//   POST   /api/expeditions        { name }       -> 201 Expedition
//   GET    /api/expeditions/:id                   -> Expedition
//   POST   /api/expeditions/:id/merge   <Expedition> -> the stored (merged) Expedition
//   POST   /api/expeditions/:id/claim   { room }  -> 200 { ok: true } | 409 { ok: false, room }
//   POST   /api/expeditions/:id/release { room }  -> 200
//   DELETE /api/expeditions/:id                   -> { trashed: name }   (reset: recoverable)
//   GET    /api/expeditions-trash                 -> { trash: [{ name, expedition }] }
//   POST   /api/expeditions-trash/:name/restore   -> Expedition
import express from 'express';
import { ExpeditionError, type ExpeditionStore } from './expeditions.js';

const STATUS = { not_found: 404, invalid: 400, exists: 409, bad_id: 400 } as const;

// `getStore` is called per request: the folder is only created when the campaign is first used (a server that never plays it leaves no files behind).
export function mountExpeditions(app: express.Express, getStore: () => ExpeditionStore): void {
  const json = express.json({ limit: '64kb' });
  const wrap =
    (fn: (req: express.Request, res: express.Response, store: ExpeditionStore) => void): express.RequestHandler =>
    (req, res) => {
      try {
        fn(req, res, getStore());
      } catch (e) {
        if (e instanceof ExpeditionError) {
          res.status(STATUS[e.code]).json({ error: e.code });
          return;
        }
        console.error('expeditions api', e);
        res.status(500).json({ error: 'internal' });
      }
    };
  const room = (req: express.Request): string => (typeof req.body?.room === 'string' ? req.body.room.slice(0, 16) : '');
  const param = (req: express.Request, k: string): string => String(req.params[k] ?? '');

  app.get(
    '/api/expeditions',
    wrap((_req, res, store) => {
      res.json({ expeditions: store.list() });
    }),
  );
  app.post(
    '/api/expeditions',
    json,
    wrap((req, res, store) => {
      res.status(201).json(store.create(req.body?.name));
    }),
  );
  app.get(
    '/api/expeditions-trash',
    wrap((_req, res, store) => {
      res.json({ trash: store.listTrash() });
    }),
  );
  app.post(
    '/api/expeditions-trash/:name/restore',
    wrap((req, res, store) => {
      res.json(store.restore(param(req, 'name')));
    }),
  );
  app.get(
    '/api/expeditions/:id',
    wrap((req, res, store) => {
      const e = store.get(param(req, 'id'));
      if (!e) throw new ExpeditionError('not_found');
      res.json(e);
    }),
  );
  app.post(
    '/api/expeditions/:id/merge',
    json,
    wrap((req, res, store) => {
      res.json(store.merge(param(req, 'id'), req.body));
    }),
  );
  app.post(
    '/api/expeditions/:id/claim',
    json,
    wrap((req, res, store) => {
      const r = store.claim(param(req, 'id'), room(req));
      res.status(r.ok ? 200 : 409).json(r);
    }),
  );
  app.post(
    '/api/expeditions/:id/release',
    json,
    wrap((req, res, store) => {
      store.release(param(req, 'id'), room(req));
      res.json({ ok: true });
    }),
  );
  app.delete(
    '/api/expeditions/:id',
    wrap((req, res, store) => {
      res.json({ trashed: store.trash(param(req, 'id')) });
    }),
  );
}
