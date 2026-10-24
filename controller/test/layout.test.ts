// Automatic layout check of the phone page: every state x landscape viewport x safe-area inset, measured in headless Chrome
// (touch emulation) with getBoundingClientRect. Fails when a label lands on a control, text is cut or leaves the screen,
// something is pressable below 44x44 CSS px, or a control ends up under the notch / home indicator.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { violations } from './checks';
import { PORTRAIT, SCENARIOS, VIEWPORTS, insetsName, openSession, type Session } from './harness';

let s: Session;
beforeAll(async () => { s = await openSession(); }, 60_000);
afterAll(async () => { await s?.close(); }, 30_000);

describe('phone layout', () => {
  it('has no overlaps, clipped text, small touch targets or safe-area violations in any state', async () => {
    const bad: string[] = [];
    let probes = 0;
    for (const sc of SCENARIOS) {
      await s.load(sc);
      const vps = sc.portrait ? [PORTRAIT] : VIEWPORTS;
      for (const v of vps) for (const ins of v.insets) {
        await s.setViewport(v, ins);
        const p = await s.probe();
        probes++;
        // the probe must really see the emulated environment: a green from measuring nothing is worthless
        expect(p.vw).toBe(v.w); expect(p.vh).toBe(v.h);
        expect(p.inset).toEqual(ins);
        if (!sc.portrait) expect(p.items.length, `${sc.name} ${v.name}: nothing measured`).toBeGreaterThan(1);
        if (sc.portrait) { expect(p.items.some((i) => i.sel === '#rotate > *')).toBe(true); continue; }
        for (const msg of violations(p)) bad.push(`${sc.name} @ ${v.name} ${insetsName(ins)}: ${msg}`);
      }
    }
    expect(s.pageErrors()).toEqual([]);
    expect(probes).toBeGreaterThan(100);
    expect(bad).toEqual([]);
  }, 240_000);

  it('the pad shows the three controls in the playing state (sanity of the harness)', async () => {
    const sc = SCENARIOS.find((x) => x.name === 'play-puesto')!;
    await s.load(sc);
    await s.setViewport(VIEWPORTS[0]!, VIEWPORTS[0]!.insets[0]!);
    const p = await s.probe();
    for (const sel of ['#stickhint', '#btnA', '#btnB', '#puesto', '#pswap', '#stickLbl .lbl', '#lblA .lbl', '#lblB .lbl']) expect(p.items.some((i) => i.sel === sel), sel).toBe(true);
  }, 60_000);

  it('hit-testing: the circles take their own touches, plates and the hint let them through, the left half is the stick zone', async () => {
    await s.load(SCENARIOS.find((x) => x.name === 'play-puesto')!);
    for (const v of VIEWPORTS) for (const ins of v.insets) {
      await s.setViewport(v, ins);
      const hit = await s.eval<Record<string, string>>(`(() => {
        const id = (x, y) => { const e = document.elementFromPoint(x, y); const c = e && e.closest('[id]'); return c ? c.id : String(e && e.tagName); };
        const mid = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; };
        const above = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height - 6]; };
        const out = {};
        for (const [k, sel] of [['A', '#btnA'], ['B', '#btnB']]) out[k] = id(...mid(sel));
        for (const [k, sel] of [['plateA', '#lblA'], ['plateB', '#lblB'], ['plateStick', '#stickLbl'], ['hint', '#stickhint']]) out[k] = id(...mid(sel));
        out.zone = id(innerWidth * 0.25, innerHeight * 0.12);
        out.swap = id(...mid('#pswap'));
        return out;
      })()`);
      expect(hit, `${v.name} ${insetsName(ins)}`).toEqual({ A: 'btnA', B: 'btnB', plateA: 'pad', plateB: 'pad', plateStick: 'zone', hint: 'zone', zone: 'zone', swap: 'pswap' });
    }
  }, 60_000);

  it("versus results: the phone shows how its team ended and the score of its OWN team, framed in the team's colour; coop shows neither", async () => {
    const read = async (name: string) => {
      await s.load(SCENARIOS.find((x) => x.name === name)!);
      await s.setViewport(VIEWPORTS[1]!, VIEWPORTS[1]!.insets[0]!);
      return s.eval<{ verdict: string; shown: boolean; rank: string; score: string; outcome: string | undefined; frame: string }>(`(() => {
        const v = document.getElementById('verdict');
        return { verdict: v.textContent, shown: getComputedStyle(v).display !== 'none', rank: document.getElementById('rank').textContent, score: document.getElementById('myscore').textContent, outcome: document.body.dataset.outcome, frame: getComputedStyle(document.getElementById('results')).boxShadow };
      })()`);
    };
    const won = await read('vs-results-won');
    expect([won.verdict, won.shown, won.rank, won.score, won.outcome]).toEqual(['¡Ganaron!', true, '410', 'puntos de tu equipo', 'won']);
    expect(won.frame).toContain('168, 51, 10'); // Picantes #A8330A
    const lost = await read('vs-results-lost');
    expect([lost.verdict, lost.rank, lost.outcome]).toEqual(['Perdieron', '340', 'lost']); // team 1 reads ITS 340 from the scores of both teams, not the winner's 410
    expect(lost.frame).toContain('20, 51, 138'); // Frescos #14338A
    const draw = await read('vs-results-draw');
    expect([draw.verdict, draw.rank, draw.outcome]).toEqual(['¡Empate!', '410', 'draw']);
    const none = await read('vs-results-none');
    expect([none.verdict, none.outcome]).toEqual(['Sin ganador', 'none']);
    const coop = await read('results');
    expect([coop.shown, coop.outcome, coop.rank, coop.score]).toEqual([false, undefined, '1240', 'puntos de equipo']);
  }, 90_000);

  it("the Captain's D-pad shows its 7 buttons on every screen but the round, and only on the Captain's phone", async () => {
    const count = async (name: string) => { await s.load(SCENARIOS.find((x) => x.name === name)!); await s.setViewport(VIEWPORTS[1]!, VIEWPORTS[1]!.insets[0]!); return (await s.probe()).items.filter((i) => i.sel === '#remote .rb').length; };
    for (const n of ['captain-menu', 'captain-lobby', 'captain-howto', 'captain-results']) expect(await count(n), n).toBe(7);
    for (const n of ['captain-play', 'not-captain-menu', 'not-captain-howto', 'menu', 'lobby', 'results', 'play']) expect(await count(n), n).toBe(0);
  }, 90_000);

  it("hit-testing: each D-pad button takes the touch at its centre, in every viewport and inset", async () => {
    await s.load(SCENARIOS.find((x) => x.name === 'captain-howto')!); // the busiest screen: the card sits right beside the D-pad
    for (const v of VIEWPORTS) for (const ins of v.insets) {
      await s.setViewport(v, ins);
      const hit = await s.eval<Record<string, string | null>>(`(() => {
        const out = {};
        for (const b of document.querySelectorAll('#remote [data-nav]')) { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); out[b.dataset.nav] = e && e.closest('[data-nav]') ? e.closest('[data-nav]').dataset.nav : String(e && e.tagName); }
        return out;
      })()`);
      expect(hit, `${v.name} ${insetsName(ins)}`).toEqual({ help: 'help', up: 'up', back: 'back', left: 'left', ok: 'ok', right: 'right', down: 'down' });
    }
  }, 60_000);

  it("tapping the D-pad sends one 'nav' per button with only the key in it (no id: the relay knows the socket), and the pad's buttons still work", async () => {
    await s.load(SCENARIOS.find((x) => x.name === 'captain-menu')!);
    await s.setViewport(VIEWPORTS[3]!, VIEWPORTS[3]!.insets[1]!);
    await s.eval(`window.__sent = []`);
    for (const key of ['up', 'down', 'left', 'right', 'ok', 'back', 'help']) {
      const [x, y] = await s.eval<[number, number]>(`(() => { const r = document.querySelector('#remote [data-nav=${key}]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
      await s.tap(x, y);
    }
    const sent = (await s.eval<{ t: string; key?: string }[]>(`window.__sent`)).filter((m) => m.t === 'nav');
    expect(sent).toEqual(['up', 'down', 'left', 'right', 'ok', 'back', 'help'].map((key) => ({ t: 'nav', key })));
    // a phone that is not the Captain has no buttons to press: a tap where the D-pad would be sends nothing
    await s.load(SCENARIOS.find((x) => x.name === 'not-captain-menu')!);
    await s.eval(`window.__sent = []`);
    await s.tap(780, 195); await s.tap(700, 195);
    expect((await s.eval<{ t: string }[]>(`window.__sent`)).filter((m) => m.t === 'nav')).toEqual([]);
    // the round: the Captain's phone has the pad alone; its buttons keep working
    await s.load(SCENARIOS.find((x) => x.name === 'captain-play')!);
    await s.eval(`window.__sent = []`);
    const [ax, ay] = await s.eval<[number, number]>(`(() => { const r = document.querySelector('#btnA').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await s.tap(ax, ay);
    const msgs = await s.eval<{ t: string; presses?: number[] }[]>(`window.__sent`);
    expect(msgs.some((m) => m.t === 'input' && (m.presses?.[0] ?? 0) >= 1), 'button A still counts a press').toBe(true);
    expect(msgs.filter((m) => m.t === 'nav')).toEqual([]);
  }, 90_000);

  it('the signal pad (campaign): 6 buttons in a campaign round, none in a quick-match round or before the round starts', async () => {
    const count = async (name: string) => { await s.load(SCENARIOS.find((x) => x.name === name)!); await s.setViewport(VIEWPORTS[1]!, VIEWPORTS[1]!.insets[0]!); return (await s.probe()).items.filter((i) => i.sel === '#signals .sg').length; };
    expect(await count('play-campaign')).toBe(6);
    for (const n of ['play', 'play-puesto', 'lobby', 'results', 'captain-play']) expect(await count(n), n).toBe(0);
  }, 90_000);

  it('hit-testing: each signal button takes the touch at its centre, in every viewport and inset', async () => {
    await s.load(SCENARIOS.find((x) => x.name === 'play-campaign')!);
    for (const v of VIEWPORTS) for (const ins of v.insets) {
      await s.setViewport(v, ins);
      const hit = await s.eval<Record<string, string | null>>(`(() => {
        const out = {};
        for (const b of document.querySelectorAll('#signals [data-sig]')) { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); out[b.dataset.sig] = e && e.closest('[data-sig]') ? e.closest('[data-sig]').dataset.sig : String(e && e.tagName); }
        return out;
      })()`);
      expect(hit, `${v.name} ${insetsName(ins)}`).toEqual({ arrowL: 'arrowL', arrowU: 'arrowU', arrowR: 'arrowR', wait: 'wait', arrowD: 'arrowD', go: 'go' });
    }
  }, 60_000);

  it('tapping the signal pad sends one new signal per tap (a counter from the baseline 0), holding "¡Ya!" holds `go`, and a quick-match phone sends neither', async () => {
    await s.load(SCENARIOS.find((x) => x.name === 'play-campaign')!);
    await s.setViewport(VIEWPORTS[3]!, VIEWPORTS[3]!.insets[1]!); // (the packets the pad sent since the round began are kept: the first ones carry the baseline)
    const centre = (kind: string) => s.eval<[number, number]>(`(() => { const r = document.querySelector('#signals [data-sig=${kind}]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    for (const kind of ['arrowL', 'arrowU', 'arrowR', 'wait', 'arrowD', 'go']) { const [x, y] = await centre(kind); await s.tap(x, y); }
    type In = { t: string; sig?: { kind: string; seq: number }; go?: boolean };
    const inputs = (await s.eval<In[]>(`window.__sent`)).filter((m) => m.t === 'input');
    const seen: string[] = [];
    for (const m of inputs) { const k = `${m.sig!.kind}:${m.sig!.seq}`; if (seen[seen.length - 1] !== k) seen.push(k); }
    expect(seen).toEqual(['go:0', 'arrowL:1', 'arrowU:2', 'arrowR:3', 'wait:4', 'arrowD:5', 'go:6']);
    expect(inputs.every((m) => typeof m.go === 'boolean')).toBe(true);
    // hold "¡Ya!": `go` is true while the thumb is down and false after it lifts
    await s.eval(`window.__sent = []`);
    const [gx, gy] = await centre('go');
    await s.hold(gx, gy, 700);
    const held = (await s.eval<In[]>(`window.__sent`)).filter((m) => m.t === 'input');
    expect(held.some((m) => m.go === true)).toBe(true);
    expect(held[held.length - 1]!.go).toBe(false);
    expect(held.filter((m) => m.go === true).length).toBeGreaterThanOrEqual(3); // it was sent while held (10 Hz), not just on the press
    // a quick-match round: the old packets, no `sig`, no `go`
    await s.load(SCENARIOS.find((x) => x.name === 'play')!);
    await s.eval(`window.__sent = []`);
    const [ax, ay] = await s.eval<[number, number]>(`(() => { const r = document.querySelector('#btnA').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await s.tap(ax, ay);
    const quick = (await s.eval<In[]>(`window.__sent`)).filter((m) => m.t === 'input');
    expect(quick.length).toBeGreaterThan(0);
    expect(quick.some((m) => 'sig' in m || 'go' in m)).toBe(false);
  }, 90_000);
});
