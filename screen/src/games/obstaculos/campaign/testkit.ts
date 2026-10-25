// Test helpers for the campaign's screen code: an in-memory stand-in for the server's API and for localStorage.
import { mergeExpedition, newExpedition, parseExpedition, starCount, type Expedition } from '@party/shared/obstaculos/campaign';
import type { ApiLike } from './flow';
import type { ClaimResult, ExpeditionSummary, KV } from './api';

export class MemKV implements KV {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

export class FakeApi implements ApiLike {
  store = new Map<string, Expedition>();
  claims = new Map<string, string>();
  down = false; // every call fails like an unreachable server
  merges = 0;
  private n = 0;
  constructor(private clock = () => 1000) {}
  private guard<T>(v: T, bad: T): T {
    return this.down ? bad : v;
  }
  async list(): Promise<ExpeditionSummary[] | null> {
    if (this.down) return null;
    return [...this.store.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((e) => ({
        id: e.id,
        name: e.name,
        updatedAt: e.updatedAt,
        stars: Object.values(e.levels).reduce((a, p) => a + starCount(p), 0),
        lastLevelId: e.lastLevelId,
        active: this.claims.has(e.id),
      }));
  }
  async get(id: string) {
    return this.guard(this.store.get(id) ?? null, null);
  }
  async create(name: string) {
    if (this.down) return null;
    const e = newExpedition(`exp-fake${String(++this.n).padStart(4, '0')}`, name, this.clock());
    this.store.set(e.id, e);
    return e;
  }
  async merge(e: Expedition) {
    if (this.down) return null;
    this.merges++;
    const cur = this.store.get(e.id);
    if (!cur || !parseExpedition(e)) return null;
    const m = mergeExpedition(cur, e);
    this.store.set(e.id, m);
    return m;
  }
  async claim(id: string, room: string): Promise<ClaimResult> {
    if (this.down) return { ok: 'error' };
    const held = this.claims.get(id);
    if (held && held !== room) return { ok: false, room: held };
    this.claims.set(id, room);
    return { ok: true };
  }
  async release(id: string, room: string) {
    if (this.claims.get(id) === room) this.claims.delete(id);
  }
  async reset(id: string) {
    if (this.down) return false;
    return this.store.delete(id);
  }
}
