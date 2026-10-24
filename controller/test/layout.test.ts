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

  it('contextual buttons: label, glyph and greyed state follow the hint; a later hint replaces the earlier one whole; leaving the round gives the game its labels back', async () => {
    const read = async () => { await new Promise((r) => setTimeout(r, 250)); return readNow(); }; // the greying is a 120 ms transition: read the settled style
    const readNow = () => s.eval<{ a: string; b: string; ia: string; ib: string; offA: boolean; offB: boolean; fa: string; fb: string; plateA: boolean; plateB: boolean }>(`(() => {
      const q = (sel) => document.querySelector(sel);
      return { a: q('#lblA .lbl').textContent, b: q('#lblB .lbl').textContent, ia: q('#btnA svg').innerHTML.slice(0, 40), ib: q('#btnB svg').innerHTML.slice(0, 40),
        offA: q('#btnA').classList.contains('off'), offB: q('#btnB').classList.contains('off'), fa: getComputedStyle(q('#btnA')).backgroundImage, fb: getComputedStyle(q('#btnB')).backgroundImage,
        plateA: q('#lblA').classList.contains('off'), plateB: q('#lblB').classList.contains('off') };
    })()`);
    const push = (m: object) => s.eval(`window.__push(${JSON.stringify(m)})`);
    await s.load(SCENARIOS.find((x) => x.name === 'play-puesto')!);
    await s.setViewport(VIEWPORTS[1]!, VIEWPORTS[1]!.insets[0]!);
    const own = await read();
    expect([own.a, own.b, own.offA, own.offB]).toEqual(['Tomar / Soltar', 'Picar / Correr', false, false]);
    await push({ t: 'hint', a: 'Al horno', b: 'Estirar', aIcon: 'oven', bIcon: 'chop' });
    const lit = await read();
    expect([lit.a, lit.b, lit.offA, lit.offB]).toEqual(['Al horno', 'Estirar', false, false]);
    expect(lit.ia).not.toBe(own.ia); // the glyph changed with the label (grab -> oven)
    expect(lit.ib).toBe(own.ib); // chop stays chop
    expect(lit.fa).not.toBe(lit.fb); // lit: A is red, B is yellow
    await push({ t: 'hint', a: 'Tomar', b: 'Correr', aIcon: 'grab', bIcon: 'move', aOff: true, bOff: true });
    const grey = await read();
    expect([grey.a, grey.b, grey.offA, grey.offB, grey.plateA, grey.plateB]).toEqual(['Tomar', 'Correr', true, true, true, true]);
    expect(grey.fa, 'both greyed buttons wear the same flat grey').toBe(grey.fb);
    expect(grey.fa).not.toBe(lit.fa);
    await push({ t: 'hint', a: 'Entregar', b: 'Picar', aIcon: 'bell', bIcon: 'chop', bOff: true }); // the whole state: A is lit again, only B stays grey
    const mixed = await read();
    expect([mixed.a, mixed.offA, mixed.offB, mixed.fa]).toEqual(['Entregar', false, true, lit.fa]); // A lit again (red), only B stays grey
    await push({ t: 'hint', a: null, b: null }); // back to the game's own labels
    const back = await read();
    expect([back.a, back.b, back.offA, back.offB, back.ia]).toEqual(['Tomar / Soltar', 'Picar / Correr', false, false, own.ia]);
    await push({ t: 'hint', a: 'Al horno', b: 'Picar', aIcon: 'oven', bIcon: 'chop', aOff: true });
    await push({ t: 'phase', phase: 'results', scores: [{ id: 1, score: 5 }] }); // the round ends: the labels go with it
    await push({ t: 'phase', phase: 'playing' });
    const after = await read();
    expect([after.a, after.b, after.offA, after.offB]).toEqual(['Tomar / Soltar', 'Picar / Correr', false, false]);
  }, 60_000);

  it('a greyed button still takes the press (it is only a hint, and the sim buffers an early press for a station that shows up)', async () => {
    await s.load(SCENARIOS.find((x) => x.name === 'play-hint-off')!);
    await s.setViewport(VIEWPORTS[1]!, VIEWPORTS[1]!.insets[0]!);
    await s.eval(`window.__sent = []`);
    const [ax, ay] = await s.eval<[number, number]>(`(() => { const r = document.querySelector('#btnA').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await s.tap(ax, ay);
    expect((await s.eval<{ t: string; presses?: number[] }[]>(`window.__sent`)).some((m) => m.t === 'input' && (m.presses?.[0] ?? 0) >= 1)).toBe(true);
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
});
