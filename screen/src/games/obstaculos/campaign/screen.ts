// The campaign on the Mac's screen: owns the state of the hub, the map and the result panel, turns keys (the keyboard's and the Captain's D-pad,
// which main.ts already unifies) into the model's effects and runs them against the flow. main.ts only lends it the things it owns
// (the phase, the players, the iris, the sounds) through ScreenDeps and asks it to draw.
import { nextLevel, type Catalog, type CatalogLevel } from '@party/shared/obstaculos/campaign';
import type { Difficulty } from '@party/shared/difficulty';
import { campKey, hubItems, initialState, startNode, worldNodes, type CampState, type Effect, type KeyCtx } from './model';
import { renderHub, renderMap, renderPick, renderResult, type ViewCtx } from './view';
import { CampaignFlow, type FlowDeps, type Hub, type LevelEnd } from './flow';

export type Sfx = 'move' | 'pick' | 'back' | 'refuse';
export interface ScreenDeps extends FlowDeps {
  host: { set(html: string): void }; // the lobby panel
  results: { set(html: string): void }; // the results panel
  names(): string[]; // connected players' names, in slot order
  count(): number; // connected players
  difficulty(): { value: Difficulty; set(d: Difficulty): void; labels: Record<Difficulty, string>; all: readonly Difficulty[] };
  sfx(s: Sfx): void;
  leaveToMenu(): void; // Esc on the hub: back to the Pichiclub menu
  quick(): void; // "Partida rápida": the quick-game setup takes the lobby
  play(levelId: string): void; // main takes the phones from here: iris, phase 'playing', and it calls runSpec() for the world
  toLobby(): void; // from the results back to the lobby (the map)
  refresh(): void; // main re-renders the page (renderUi)
}

export class CampaignScreen {
  readonly flow: CampaignFlow;
  on = false; // the lobby shows the campaign
  resultOn = false; // the results panel shows the campaign's
  state: CampState = initialState();
  hub: Hub = { list: [], last: null, offline: false };
  private busy = false;
  private readonly deps: ScreenDeps;

  constructor(deps: ScreenDeps) { this.deps = deps; this.flow = new CampaignFlow(deps); }

  private get now() { return (this.deps.now ?? Date.now)(); }
  private get catalog(): Catalog { return this.deps.catalog; }
  private ctx(): KeyCtx { return { now: this.now, hub: this.hub, exp: this.flow.exp, catalog: this.catalog, n: this.deps.count(), outcome: this.flow.outcome }; }
  private viewCtx(): ViewCtx {
    const d = this.deps.difficulty();
    return { ...this.ctx(), difficulty: d.value, diffLabels: d.labels, difficulties: d.all, names: this.deps.names() };
  }

  // The lobby opens on the campaign: the hub, with what "Continuar" offers.
  async enter(): Promise<void> {
    this.on = true; this.resultOn = false;
    this.state = initialState();
    this.deps.refresh();
    await this.reloadHub();
  }
  async reloadHub(): Promise<void> { this.hub = await this.flow.hub(); this.deps.refresh(); }
  async exit(): Promise<void> { this.on = false; this.resultOn = false; await this.flow.leave(); }
  quickGame(): void { this.on = false; this.resultOn = false; void this.flow.leave(); this.deps.quick(); }

  shows(phase: string): boolean { return (phase === 'lobby' && this.on) || (phase === 'results' && this.resultOn); }
  get armed(): boolean { return this.state.resetArmedAt !== null; }

  render(): void {
    if (!this.on) return;
    const c = this.viewCtx();
    const s = this.state;
    this.deps.host.set(s.view === 'pick' ? renderPick(s, c) : s.view === 'map' && c.exp ? renderMap(s, c) : renderHub(s.view === 'hub' ? s : { ...s, view: 'hub' }, c));
  }
  renderResults(): void {
    const o = this.flow.outcome;
    if (o) this.deps.results.set(renderResult(this.state, o, this.catalog));
  }

  // ---- what a campaign round needs from main.ts
  runSpec(levelId: string) { return this.flow.spec(levelId, this.deps.count(), this.deps.difficulty().value); }
  levelEnd(e: LevelEnd): void { void this.flow.levelEnd(e); }
  // The session ended (cleared and the banners are over, or out of hearts twice): wait for the save, then the results show the outcome.
  async over(): Promise<void> {
    this.flow.failed();
    await this.flow.settle();
    this.resultOn = true;
    this.state = { ...this.state, view: 'result', resSel: 0, resetArmedAt: null, notice: '' };
  }

  // ---- input
  key(key: string, repeat: boolean): boolean {
    const known = key.startsWith('Arrow') || key === 'Enter' || key === ' ' || key === 'Escape' || key === 'h' || key === 'H';
    if (!known) return false;
    if (repeat && (key === 'Enter' || key === ' ')) return true;
    if (this.busy) return true;
    const out = campKey(this.state, key, this.ctx());
    this.state = out.state;
    this.render(); this.renderResultsIf();
    if (out.effect) void this.run(out.effect);
    this.deps.refresh();
    return true;
  }
  private renderResultsIf() { if (this.resultOn) this.renderResults(); }
  // Mouse: a click is the same as moving there and pressing Enter.
  click(el: HTMLElement | null): void {
    if (!el || this.busy) return;
    const hit = (sel: string) => el.closest<HTMLElement>(sel);
    const diff = hit('[data-diff]')?.dataset.diff;
    if (diff) { const d = this.deps.difficulty().all.find((x) => x === diff); if (d) { this.deps.difficulty().set(d); } return; }
    const set = (patch: Partial<CampState>, press = true) => { this.state = { ...this.state, ...patch, resetArmedAt: null }; if (press) this.key('Enter', false); else { this.render(); this.deps.refresh(); } };
    const h = hit('[data-hub]')?.dataset.hub;
    if (h && this.state.view === 'hub') { const idx = hubItems(this.hub, this.catalog, this.deps.count()).findIndex((x) => x.id === h); if (idx >= 0) set({ hubSel: idx }); return; }
    const p = hit('[data-pick]')?.dataset.pick;
    if (p) { const idx = this.hub.list.findIndex((x) => x.id === p); if (idx >= 0) set({ pickSel: idx }); return; }
    const nd = hit('[data-node]')?.dataset.node;
    if (nd !== undefined) { set({ node: Number(nd) }); return; }
    const w = hit('[data-world]')?.dataset.world;
    if (w && this.flow.exp) { set({ world: w, node: startNode(this.flow.exp, this.catalog, w, this.deps.count()) }, false); return; }
    const r = hit('[data-res]')?.dataset.res;
    if (r) { const o = this.flow.outcome; if (o) void this.run({ t: 'result', button: r as 'next' | 'retry' | 'skip' | 'map' }); }
  }

  // ---- effects
  private notice(text: string) { this.state = { ...this.state, notice: text }; this.render(); this.deps.refresh(); }
  private async run(e: Effect): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try { await this.perform(e); } finally { this.busy = false; this.render(); this.renderResultsIf(); this.deps.refresh(); }
  }
  private async openMap(r: { ok: true } | { ok: false; reason: string }): Promise<void> {
    if (!r.ok) { this.deps.sfx('refuse'); this.notice(r.reason); return; }
    const e = this.flow.exp!;
    const at = this.flow.continueAt();
    const world = (at ? at.world : this.catalog.worlds[0]?.id) ?? '';
    this.state = { ...this.state, view: 'map', world, node: startNode(e, this.catalog, world, this.deps.count()), notice: '' };
    this.deps.sfx('pick');
  }
  private async perform(e: Effect): Promise<void> {
    const d = this.deps;
    switch (e.t) {
      case 'move': d.sfx('move'); return;
      case 'refuse': d.sfx('refuse'); this.state = { ...this.state, notice: e.reason }; return;
      case 'menu': d.sfx('back'); d.leaveToMenu(); return;
      case 'quick': d.sfx('pick'); this.quickGame(); return;
      case 'practice': d.sfx('refuse'); this.state = { ...this.state, notice: 'La Sala de práctica llega con el Mundo 1' }; return;
      case 'continue': if (this.hub.last) await this.openMap(await this.flow.open(this.hub.last.id)); return;
      case 'open': await this.openMap(await this.flow.open(e.id)); return;
      case 'new': await this.openMap(await this.flow.create(d.names(), e.skipIntro && this.catalog.worlds[1] ? [this.catalog.worlds[1].id] : [])); await this.reloadHubQuiet(); return;
      case 'leave': d.sfx('back'); await this.flow.leave(); this.state = { ...this.state, view: 'hub', notice: '' }; await this.reloadHubQuiet(); return;
      case 'play': {
        const spec = this.flow.spec(e.levelId, d.count());
        if ('ok' in spec) { d.sfx('refuse'); this.state = { ...this.state, notice: spec.reason }; return; }
        d.sfx('pick');
        this.flow.begin(e.levelId);
        this.resultOn = false;
        d.play(e.levelId);
        return;
      }
      case 'reset': {
        const ok = await this.flow.reset(e.id);
        this.state = { ...this.state, view: 'hub', hubSel: 0, notice: ok ? 'Expedición guardada en la papelera' : 'No se pudo reiniciar' };
        d.sfx(ok ? 'back' : 'refuse');
        await this.reloadHubQuiet();
        return;
      }
      case 'result': {
        const o = this.flow.outcome;
        if (!o) return;
        if (e.button === 'skip') { await this.flow.skip(o.levelId); }
        if (e.button === 'next' && o.next) { d.sfx('pick'); this.flow.begin(o.next.id); this.resultOn = false; d.play(o.next.id); return; }
        if (e.button === 'retry') { d.sfx('pick'); this.flow.begin(o.levelId); this.resultOn = false; d.play(o.levelId); return; }
        // Mapa (and Saltar, which lands there with the next level open)
        d.sfx('back');
        // the cursor lands on the next open level after a clear or a skip, on the same level after a failure
        const forward = (e.button === 'skip' || o.cleared) && this.flow.exp ? nextLevel(this.flow.exp, this.catalog, o.levelId) : null;
        const at = forward ?? this.catalogLevel(o.levelId);
        this.resultOn = false;
        const world = at?.world ?? this.state.world;
        this.state = { ...this.state, view: 'map', world, node: this.flow.exp ? Math.max(0, worldNodes(this.flow.exp, this.catalog, world, d.count()).findIndex((x) => x.levelId === (at?.id ?? o.levelId))) : 0, notice: '' };
        d.toLobby();
        return;
      }
    }
  }
  private catalogLevel(id: string): CatalogLevel | undefined { return this.catalog.levels.find((l) => l.id === id); }
  private async reloadHubQuiet(): Promise<void> { this.hub = await this.flow.hub(); }
}
