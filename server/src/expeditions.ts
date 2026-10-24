// The campaign's saved progress: one JSON file per expedition in a folder (plan §6). The server is the source of truth; the screen only remembers the id of the last one.
//
// Durability, in the order the steps run (`onStep` names each one, so a test can "kill the process" before any of them):
//   write-tmp    <id>.json.tmp   the new content, flushed to disk
//   copy-bak     <id>.json.bak.tmp <- the current <id>.json
//   rename-bak   <id>.json.bak.tmp -> <id>.json.bak       (the previous version, always whole)
//   rename       <id>.json.tmp -> <id>.json               (atomic: a reader sees the old file or the new one, never half of one)
// At every point <id>.json is either the old or the new content, so a process that dies anywhere leaves a valid file; the .bak and a leftover .tmp
// only matter if the disk itself lost the file, and reads fall back to the .bak. Reset moves the file to trash/, where it can be restored.
import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { EXPEDITION_ID, cleanName, mergeExpedition, newExpedition, parseExpedition, starCount, type Expedition } from '@party/shared/obstaculos/campaign';

export interface ExpeditionSummary { id: string; name: string; updatedAt: number; stars: number; lastLevelId: string | null; active: boolean }
export type StepName = 'write-tmp' | 'copy-bak' | 'rename-bak' | 'rename';
export interface StoreOpts { dir: string; now?: () => number; onStep?: (step: StepName, id: string) => void; claimTtlMs?: number }
export type StoreError = 'not_found' | 'invalid' | 'exists' | 'bad_id';
export class ExpeditionError extends Error { constructor(readonly code: StoreError) { super(code); } }

export const CLAIM_TTL_MS = 10 * 60_000;

export class ExpeditionStore {
  private readonly dir: string;
  private readonly trashDir: string;
  private readonly now: () => number;
  private readonly onStep: (step: StepName, id: string) => void;
  private readonly claims = new Map<string, { room: string; at: number }>(); // memory only: a restarted server forgets, which frees every expedition
  private readonly ttl: number;

  constructor(o: StoreOpts) {
    this.dir = o.dir;
    this.trashDir = path.join(o.dir, 'trash');
    this.now = o.now ?? Date.now;
    this.onStep = o.onStep ?? (() => {});
    this.ttl = o.claimTtlMs ?? CLAIM_TTL_MS;
    mkdirSync(this.trashDir, { recursive: true });
    this.recover();
  }

  private file = (id: string) => path.join(this.dir, `${id}.json`);
  private checkId(id: string): void { if (!EXPEDITION_ID.test(id)) throw new ExpeditionError('bad_id'); }

  // On start: delete the leftovers of an interrupted write and restore a file that is missing or unreadable from its .bak.
  private recover(): void {
    for (const f of readdirSync(this.dir)) {
      if (f.endsWith('.json.tmp') || f.endsWith('.json.bak.tmp')) { try { unlinkSync(path.join(this.dir, f)); } catch { /* gone */ } }
    }
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json.bak')) continue;
      const id = f.slice(0, -'.json.bak'.length);
      if (EXPEDITION_ID.test(id) && !this.readFile(this.file(id))) {
        const back = this.readFile(path.join(this.dir, f));
        if (back) this.write(id, back);
      }
    }
  }

  private readFile(p: string): Expedition | null {
    try { return parseExpedition(JSON.parse(readFileSync(p, 'utf8'))); } catch { return null; }
  }

  get(id: string): Expedition | null {
    this.checkId(id);
    return this.readFile(this.file(id)) ?? this.readFile(`${this.file(id)}.bak`);
  }

  private write(id: string, e: Expedition): void {
    const file = this.file(id), tmp = `${file}.tmp`, bak = `${file}.bak`, bakTmp = `${bak}.tmp`;
    this.onStep('write-tmp', id);
    const fd = openSync(tmp, 'w');
    try { writeSync(fd, JSON.stringify(e, null, 1)); fsyncSync(fd); } finally { closeSync(fd); }
    if (existsSync(file)) {
      this.onStep('copy-bak', id);
      copyFileSync(file, bakTmp);
      this.onStep('rename-bak', id);
      renameSync(bakTmp, bak);
    }
    this.onStep('rename', id);
    renameSync(tmp, file);
    try { const d = openSync(this.dir, 'r'); try { fsyncSync(d); } finally { closeSync(d); } } catch { /* a directory cannot be flushed everywhere */ }
  }

  list(): ExpeditionSummary[] {
    const out: ExpeditionSummary[] = [];
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      const id = f.slice(0, -5);
      if (!EXPEDITION_ID.test(id)) continue;
      const e = this.get(id);
      if (e) out.push(this.summary(e));
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }
  private summary(e: Expedition): ExpeditionSummary {
    return { id: e.id, name: e.name, updatedAt: e.updatedAt, stars: Object.values(e.levels).reduce((a, p) => a + starCount(p), 0), lastLevelId: e.lastLevelId, active: this.activeIn(e.id) !== null };
  }

  create(name: unknown): Expedition {
    let id = '';
    do id = `exp-${randomBytes(4).toString('hex')}`; while (existsSync(this.file(id)));
    const e = newExpedition(id, cleanName(name) || 'Expedición', this.now());
    this.write(id, e);
    return e;
  }

  // The screen sends the whole expedition it holds; what is stored is the union of both, so progress never goes down, whoever is stale.
  merge(id: string, incoming: unknown): Expedition {
    this.checkId(id);
    const cur = this.get(id);
    if (!cur) throw new ExpeditionError('not_found');
    const inc = parseExpedition(incoming);
    if (!inc || inc.id !== id) throw new ExpeditionError('invalid');
    const merged = mergeExpedition(cur, inc);
    this.write(id, merged);
    return merged;
  }

  // Reset: the file goes to trash/ with the time in its name; restore puts it back unless that id is in use again.
  trash(id: string): string {
    this.checkId(id);
    if (!this.get(id)) throw new ExpeditionError('not_found');
    const name = `${id}.${this.now()}.json`;
    renameSync(this.file(id), path.join(this.trashDir, name));
    try { unlinkSync(`${this.file(id)}.bak`); } catch { /* none */ }
    this.claims.delete(id);
    return name;
  }
  listTrash(): { name: string; expedition: ExpeditionSummary }[] {
    const out: { name: string; expedition: ExpeditionSummary }[] = [];
    for (const f of readdirSync(this.trashDir)) {
      const e = f.endsWith('.json') ? this.readFile(path.join(this.trashDir, f)) : null;
      if (e) out.push({ name: f, expedition: this.summary(e) });
    }
    return out.sort((a, b) => b.expedition.updatedAt - a.expedition.updatedAt);
  }
  restore(name: string): Expedition {
    if (!/^[a-z0-9-]+\.\d+\.json$/.test(name)) throw new ExpeditionError('bad_id');
    const p = path.join(this.trashDir, name);
    const e = existsSync(p) ? this.readFile(p) : null;
    if (!e) throw new ExpeditionError('not_found');
    if (this.get(e.id)) throw new ExpeditionError('exists');
    this.write(e.id, e);
    unlinkSync(p);
    return e;
  }

  // "Una expedición solo puede estar activa en una sala": a room claims it while it plays; another room is refused until it is released or the claim goes stale.
  activeIn(id: string): string | null {
    const c = this.claims.get(id);
    if (!c) return null;
    if (this.now() - c.at > this.ttl) { this.claims.delete(id); return null; }
    return c.room;
  }
  claim(id: string, room: string): { ok: true } | { ok: false; room: string } {
    this.checkId(id);
    if (!this.get(id)) throw new ExpeditionError('not_found');
    const held = this.activeIn(id);
    if (held !== null && held !== room) return { ok: false, room: held };
    this.claims.set(id, { room, at: this.now() });
    return { ok: true };
  }
  release(id: string, room: string): void {
    if (this.claims.get(id)?.room === room) this.claims.delete(id);
  }
}
