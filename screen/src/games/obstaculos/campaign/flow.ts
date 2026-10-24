// The campaign as a flow the screen walks (no DOM, no Phaser): which expedition is open, what a level that just ended did to it, what the buttons
// after it offer. main.ts wires it to the lobby, the scene and the phones; the tests drive it with a fake or a real server.
import {
  applyResult, canOfferSkip, continueLevel, levelById, nextLevel, openWorld, playableWith, progressOf, skipLevel, isUnlocked,
  type Catalog, type CatalogLevel, type Expedition, type LevelProgress,
} from '@party/shared/obstaculos/campaign';
import { worldForDifficulty, type GameMode, type LevelDef, type WorldId } from '@party/shared/obstaculos';
import type { Difficulty } from '@party/shared/difficulty';
import { lastExpedition, type CampaignApi, type ExpeditionSummary, type KV } from './api';

export type ApiLike = Pick<CampaignApi, 'list' | 'get' | 'create' | 'merge' | 'claim' | 'release' | 'reset'>;

// What the host reports when a level ends (cleared, or the team ran out of hearts on one attempt).
export interface LevelEnd { cleared: boolean; timeMs: number; collectiblesMask: number; deaths: number }

export interface Outcome {
  levelId: string;
  cleared: boolean;
  timeMs: number;
  deaths: number;
  before: LevelProgress;
  after: LevelProgress;
  next: CatalogLevel | null; // "Siguiente", when the following level is open
  failuresInARow: number;
  canSkip: boolean;
  practice?: true; // a station of the practice room: nothing is saved
  saved: boolean; // false: the server could not be reached; the progress is kept in memory and goes with the next save
}

export interface Hub {
  list: ExpeditionSummary[];
  last: Expedition | null; // what "Continuar" offers: the remembered expedition, else the most recent one
  offline: boolean;
}

// world: the sim's campaign layer for this level (its biome, or the summit's), moved one world down or up by the lobby's Easy / Hard (plan §3)
export interface RunSpec { level: CatalogLevel; def: LevelDef; mode: GameMode; world: WorldId }
export type Refusal = { ok: false; reason: string };

export interface FlowDeps { api: ApiLike; catalog: Catalog; room: string; kv: KV | null; now?: () => number }

export const joinNames = (names: readonly string[]): string => {
  const n = names.map((s) => s.trim()).filter(Boolean);
  if (n.length === 0) return 'Expedición';
  if (n.length === 1) return n[0]!;
  if (n.length <= 3) return `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
  return `${n.slice(0, 2).join(', ')} y ${n.length - 2} más`;
};

export class CampaignFlow {
  exp: Expedition | null = null;
  outcome: Outcome | null = null;
  readonly failures = new Map<string, number>(); // game overs in a row, per level, for this session of the screen
  private current: { levelId: string; deaths: number } | null = null;
  private pending: Promise<void> = Promise.resolve();
  private saved = true;
  private readonly now: () => number;

  constructor(readonly deps: FlowDeps) { this.now = deps.now ?? Date.now; }
  get catalog(): Catalog { return this.deps.catalog; }

  // The hub: who is there to continue. The remembered id wins; with nothing remembered (new browser, cleared cache) the most recently played one does.
  async hub(): Promise<Hub> {
    const list = await this.deps.api.list();
    if (!list) return { list: [], last: null, offline: true };
    const remembered = lastExpedition.get(this.deps.kv);
    const pick = list.find((x) => x.id === remembered) ?? list[0];
    if (remembered && !list.some((x) => x.id === remembered)) lastExpedition.clear(this.deps.kv);
    const last = pick ? await this.deps.api.get(pick.id) : null;
    return { list, last, offline: false };
  }

  // Opens an expedition for this room: another room playing it refuses.
  async open(id: string): Promise<{ ok: true } | Refusal> {
    const c = await this.deps.api.claim(id, this.deps.room);
    if (c.ok === 'error') return { ok: false, reason: 'No se pudo abrir la expedición' };
    if (c.ok === false) return { ok: false, reason: `Esa expedición está jugando en la sala ${c.room}` };
    const e = await this.deps.api.get(id);
    if (!e) { await this.deps.api.release(id, this.deps.room); return { ok: false, reason: 'No se pudo leer la expedición' }; }
    if (this.exp && this.exp.id !== id) await this.deps.api.release(this.exp.id, this.deps.room);
    this.exp = e;
    this.outcome = null;
    lastExpedition.set(this.deps.kv, id);
    return { ok: true };
  }

  // "Nueva expedición"; `openWorlds` is "ya sabemos escalar" (those worlds start open).
  async create(names: readonly string[], openWorlds: readonly string[] = []): Promise<{ ok: true } | Refusal> {
    let e = await this.deps.api.create(joinNames(names));
    if (!e) return { ok: false, reason: 'No se pudo crear la expedición' };
    for (const w of openWorlds) e = openWorld(e, this.catalog, w, this.now());
    if (openWorlds.length) e = (await this.deps.api.merge(e)) ?? e;
    return this.open(e.id);
  }

  async leave(): Promise<void> {
    const e = this.exp;
    this.exp = null; this.current = null; this.outcome = null;
    if (e) await this.deps.api.release(e.id, this.deps.room);
  }

  async reset(id: string): Promise<boolean> {
    const ok = await this.deps.api.reset(id);
    if (ok) {
      if (this.exp?.id === id) { this.exp = null; this.outcome = null; }
      if (lastExpedition.get(this.deps.kv) === id) lastExpedition.clear(this.deps.kv);
    }
    return ok;
  }

  // ---- playing a level
  // What the session needs to run `levelId` (the level's own tilemap and mode), or why it cannot: closed, or not validated for this many players.
  spec(levelId: string, n: number, difficulty: Difficulty = 'normal'): RunSpec | Refusal {
    const e = this.exp, level = levelById(this.catalog, levelId);
    if (level?.kind === 'practice') return playableWith(level, n) ? { level, def: level.def, mode: level.mode, world: worldForDifficulty('beach', difficulty) } : { ok: false, reason: 'Esta estación no está validada para este grupo' };
    if (!e || !level) return { ok: false, reason: 'Nivel desconocido' };
    if (!isUnlocked(e, this.catalog, levelId)) return { ok: false, reason: 'Todavía está cerrado' };
    if (!playableWith(level, n)) return { ok: false, reason: `Este nivel no está validado para ${n} ${n === 1 ? 'jugador' : 'jugadores'}` };
    return { level, def: level.def, mode: level.mode, world: worldForDifficulty(level.kind === 'summit' ? 'summit' : level.def.biome, difficulty) };
  }
  begin(levelId: string): void { this.current = { levelId, deaths: 0 }; this.outcome = null; }
  private get practicing(): boolean { return !!this.current && levelById(this.catalog, this.current.levelId)?.kind === 'practice'; }

  // One attempt of the level ended. Cleared: the result is folded into the expedition and saved right now. Not cleared: the hearts it cost are
  // carried to the next attempt of the same session (star 3 needs none lost in the whole play).
  levelEnd(end: LevelEnd): Promise<void> {
    const cur = this.current, e = this.exp;
    if (cur && this.practicing) { // the practice room: no hearts to count, nothing to save
      if (end.cleared) this.outcome = this.practiceOutcome(cur.levelId, true, end.timeMs, 0);
      return Promise.resolve();
    }
    if (!cur || !e) return Promise.resolve();
    if (!end.cleared) { cur.deaths += end.deaths; return Promise.resolve(); }
    const before = progressOf(e, cur.levelId);
    const local = applyResult(e, this.catalog, { levelId: cur.levelId, cleared: true, timeMs: end.timeMs, collectiblesMask: end.collectiblesMask, deaths: cur.deaths + end.deaths }, this.now());
    this.exp = local;
    this.failures.delete(cur.levelId);
    this.outcome = this.outcomeOf(cur.levelId, true, end.timeMs, cur.deaths + end.deaths, before, local);
    this.pending = this.pending.then(() => this.save());
    return this.pending;
  }
  // The session is over without a clear: the team ran out of hearts twice.
  failed(): void {
    const cur = this.current, e = this.exp;
    if (cur && this.practicing) { if (!this.outcome?.cleared) this.outcome = this.practiceOutcome(cur.levelId, false, 0, 0); return; }
    if (!cur || !e || this.outcome?.cleared) return;
    this.failures.set(cur.levelId, (this.failures.get(cur.levelId) ?? 0) + 1);
    const p = progressOf(e, cur.levelId);
    this.outcome = this.outcomeOf(cur.levelId, false, 0, cur.deaths, p, e);
  }
  private practiceOutcome(levelId: string, cleared: boolean, timeMs: number, deaths: number): Outcome {
    const p = progressOf({ levels: {} } as Expedition, levelId);
    return { levelId, cleared, timeMs, deaths, before: p, after: p, next: null, failuresInARow: 0, canSkip: false, practice: true, saved: true };
  }
  private outcomeOf(levelId: string, cleared: boolean, timeMs: number, deaths: number, before: LevelProgress, e: Expedition): Outcome {
    const fails = this.failures.get(levelId) ?? 0;
    return { levelId, cleared, timeMs, deaths, before, after: progressOf(e, levelId), next: nextLevel(e, this.catalog, levelId), failuresInARow: fails, canSkip: !cleared && canOfferSkip(fails) && !progressOf(e, levelId).done, saved: this.saved };
  }
  private async save(): Promise<void> {
    const e = this.exp;
    if (!e) return;
    const merged = await this.deps.api.merge(e);
    this.saved = !!merged;
    if (merged && this.exp?.id === merged.id) this.exp = merged;
    if (this.outcome) { this.outcome.saved = this.saved; if (merged) { this.outcome.next = nextLevel(merged, this.catalog, this.outcome.levelId); this.outcome.after = progressOf(merged, this.outcome.levelId); } }
  }
  async settle(): Promise<void> { await this.pending; }

  async skip(levelId: string): Promise<boolean> {
    const e = this.exp;
    if (!e) return false;
    const next = skipLevel(e, this.catalog, levelId, this.now());
    if (next === e) return false;
    this.exp = next;
    this.failures.delete(levelId);
    this.pending = this.pending.then(() => this.save());
    await this.pending;
    return true;
  }

  continueAt(): CatalogLevel | null { return this.exp ? continueLevel(this.exp, this.catalog) : null; }
}
