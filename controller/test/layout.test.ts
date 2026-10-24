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
