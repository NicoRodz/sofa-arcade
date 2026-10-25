// The screen's side of the campaign's saved progress: a small client for the server's /api/expeditions (games/obstaculos/server/expeditions-api.ts) and the one
// thing the Mac keeps for itself, the id of the last expedition ("Continuar"). The server is the source of truth: localStorage only points at it.
import { parseExpedition, type Expedition } from '../../campaign/index';

export interface ExpeditionSummary {
  id: string;
  name: string;
  updatedAt: number;
  stars: number;
  lastLevelId: string | null;
  active: boolean;
}
export type Fetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export type ClaimResult = { ok: true } | { ok: false; room: string } | { ok: 'error' };

export class CampaignApi {
  constructor(
    private readonly doFetch: Fetch = (u, i) => fetch(u, i),
    private readonly base = '/api/expeditions',
  ) {}

  private async call(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
    try {
      const r = await this.doFetch(`${this.base}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) };
    } catch {
      return { ok: false, status: 0, data: null };
    } // the server is down or the network is: the caller decides what to say
  }

  async list(): Promise<ExpeditionSummary[] | null> {
    const r = await this.call('GET', '');
    return r.ok && Array.isArray(r.data?.expeditions) ? (r.data.expeditions as ExpeditionSummary[]) : null;
  }
  async get(id: string): Promise<Expedition | null> {
    const r = await this.call('GET', `/${encodeURIComponent(id)}`);
    return r.ok ? parseExpedition(r.data) : null;
  }
  async create(name: string): Promise<Expedition | null> {
    const r = await this.call('POST', '', { name });
    return r.ok ? parseExpedition(r.data) : null;
  }
  // Sends the whole expedition; what comes back is the union with what the server had (never less than what was sent).
  async merge(e: Expedition): Promise<Expedition | null> {
    const r = await this.call('POST', `/${encodeURIComponent(e.id)}/merge`, e);
    return r.ok ? parseExpedition(r.data) : null;
  }
  async claim(id: string, room: string): Promise<ClaimResult> {
    const r = await this.call('POST', `/${encodeURIComponent(id)}/claim`, { room });
    if (r.ok) return { ok: true };
    return r.status === 409 ? { ok: false, room: String(r.data?.room ?? '') } : { ok: 'error' };
  }
  async release(id: string, room: string): Promise<void> {
    await this.call('POST', `/${encodeURIComponent(id)}/release`, { room });
  }
  async reset(id: string): Promise<boolean> {
    return (await this.call('DELETE', `/${encodeURIComponent(id)}`)).ok;
  }
}

// What the Mac remembers: only the id of the last expedition. Storage can be blocked or empty (private window): then there is simply no "Continuar".
export const LAST_KEY = 'pg.obst.lastExp';
export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}
export const lastExpedition = {
  get(kv: KV | null): string | null {
    try {
      return kv?.getItem(LAST_KEY) ?? null;
    } catch {
      return null;
    }
  },
  set(kv: KV | null, id: string): void {
    try {
      kv?.setItem(LAST_KEY, id);
    } catch {
      /* blocked */
    }
  },
  clear(kv: KV | null): void {
    try {
      kv?.removeItem(LAST_KEY);
    } catch {
      /* blocked */
    }
  },
};
