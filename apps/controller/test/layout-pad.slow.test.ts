// Phone layout, the pad and the lobby: controls and hit-testing in the round, contextual buttons, Modo Ayudante and the event notes.
// One browser for the file (the tests share its page); the landscape / portrait sweeps live in layout.slow.test.ts and the Captain's screens in layout-captain.slow.test.ts, so the three run side by side.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ASSIST_CARD_LINES, ASSIST_FOR, ASSIST_GIVES, assistLabel, assistToast } from '../../../games/pizzas/controller/assist';
import { settleJs, waitUntil } from './settle';
import { SCENARIOS, VIEWPORTS, insetsName, openSession, type Box, type Session } from './harness';

let s: Session;
beforeAll(async () => {
  s = await openSession();
}, 60_000);
afterAll(async () => {
  await s?.close();
}, 30_000);

const EVENT_NOTE_KINDS = ['evrush', 'evbday', 'evdark', 'evspill', 'evwin', 'evfail'];
/** Buzz the phone with an event note and measure it once it is up (the fade-in is 150 ms). */
async function showNote(kind: string, font: string) {
  await s.eval(
    `document.documentElement.style.setProperty('--font', ${JSON.stringify(font || 'inherit')}); window.dispatchEvent(new Event('resize'))`,
  );
  await s.eval(`window.__push({ t: 'buzz', playerId: 1, kind: '${kind}' })`);
  await s.eval(settleJs()); // the fade-in is 150 ms
  return s.eval<{ shown: boolean; pe: string; vw: number; sw: number; cw: number; boxes: Box[]; hits: string[]; btns: Box[] }>(`(() => {
    const el = document.getElementById('evnote');
    const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const id = (b) => { const e = document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2); const c = e && e.closest('[id]'); return c ? c.id : String(e && e.tagName); };
    const btns = ['#btnA', '#btnB'].map((q) => box(document.querySelector(q)));
    return { shown: !!el && Number(getComputedStyle(el).opacity) > 0.5, pe: el ? getComputedStyle(el).pointerEvents : '', vw: innerWidth, sw: el ? el.scrollWidth : 0, cw: el ? el.clientWidth : 0,
      boxes: el ? [...el.children].map(box) : [], hits: btns.map(id), btns };
  })()`);
}

describe('phone layout', () => {
  it('the pad shows the three controls in the playing state (sanity of the harness)', async () => {
    const sc = SCENARIOS.find((x) => x.name === 'play-puesto')!;
    await s.load(sc);
    await s.setViewport(VIEWPORTS[0]!, VIEWPORTS[0]!.insets[0]!);
    const p = await s.probe();
    for (const sel of ['#stickhint', '#btnA', '#btnB', '#puesto', '#pswap', '#stickLbl .lbl', '#lblA .lbl', '#lblB .lbl'])
      expect(
        p.items.some((i) => i.sel === sel),
        sel,
      ).toBe(true);
  }, 60_000);

  it('hit-testing: the circles take their own touches, plates and the hint let them through, the left half is the stick zone', async () => {
    await s.load(SCENARIOS.find((x) => x.name === 'play-puesto')!);
    for (const v of VIEWPORTS)
      for (const ins of v.insets) {
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
        expect(hit, `${v.name} ${insetsName(ins)}`).toEqual({
          A: 'btnA',
          B: 'btnB',
          plateA: 'pad',
          plateB: 'pad',
          plateStick: 'zone',
          hint: 'zone',
          zone: 'zone',
          swap: 'pswap',
        });
      }
  }, 60_000);

  it('contextual buttons: label, glyph and greyed state follow the hint; a later hint replaces the earlier one whole; leaving the round gives the game its labels back', async () => {
    const read = async () => {
      await s.eval(settleJs());
      return readNow();
    }; // the greying is a 120 ms transition: read the settled style
    const readNow = () =>
      s.eval<{
        a: string;
        b: string;
        ia: string;
        ib: string;
        offA: boolean;
        offB: boolean;
        fa: string;
        fb: string;
        plateA: boolean;
        plateB: boolean;
      }>(`(() => {
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
    const [ax, ay] = await s.eval<[number, number]>(
      `(() => { const r = document.querySelector('#btnA').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`,
    );
    await s.tap(ax, ay);
    expect(
      (await s.eval<{ t: string; presses?: number[] }[]>(`window.__sent`)).some((m) => m.t === 'input' && (m.presses?.[0] ?? 0) >= 1),
    ).toBe(true);
  }, 60_000);

  it('Ayudante: the switch is in the pizzas lobby only; a tap sends the whole choice, the label and aria follow, and the relay settles it (also for a reconnect)', async () => {
    const state = () =>
      s.eval<{ label: string; on: boolean; aria: string; shown: boolean }>(
        `(() => { const b = document.getElementById('assist'); return { label: document.getElementById('assistlbl').textContent, on: b.classList.contains('on'), aria: b.getAttribute('aria-pressed'), shown: getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0 }; })()`,
      );
    const centre = () =>
      s.eval<[number, number]>(
        `(() => { const r = document.getElementById('assist').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`,
      );
    const sentAssist = async () => (await s.eval<{ t: string; on?: boolean }[]>(`window.__sent`)).filter((m) => m.t === 'assist');
    await s.load(SCENARIOS.find((x) => x.name === 'lobby')!);
    await s.setViewport(VIEWPORTS[3]!, VIEWPORTS[3]!.insets[0]!);
    expect(await state()).toEqual({ label: 'Modo Ayudante: no', on: false, aria: 'false', shown: true });
    await s.eval(`window.__sent = []`);
    await s.tap(...(await centre()));
    expect(await sentAssist()).toEqual([{ t: 'assist', on: true }]);
    expect(await state()).toEqual({ label: 'Modo Ayudante: sí', on: true, aria: 'true', shown: true });
    await s.tap(...(await centre()));
    expect(await sentAssist()).toEqual([
      { t: 'assist', on: true },
      { t: 'assist', on: false },
    ]);
    expect((await state()).label).toBe('Modo Ayudante: no');
    await s.eval(`window.__push({ t: 'assist', playerId: 1, on: true })`); // the relay: this phone had it on (a reconnect)
    expect(await state()).toEqual({ label: 'Modo Ayudante: sí', on: true, aria: 'true', shown: true });
    await s.eval(`window.__push({ t: 'assist', playerId: 7, on: false })`); // somebody else's: ignored
    expect((await state()).on).toBe(true);
    await s.eval(`window.__push({ t: 'phase', phase: 'playing' })`); // in the round the overlay is gone: no switch to press
    expect((await state()).shown).toBe(false);
    await s.load(SCENARIOS.find((x) => x.name === 'lobby-other-game')!);
    expect((await state()).shown, 'another game has no Ayudante').toBe(false);
  }, 60_000);

  it('Modo Ayudante copy: the one-liner stays short, the notice names the cap, the card has three lines with the versus cost', () => {
    expect(ASSIST_GIVES.split(/\s+/).length).toBeLessThanOrEqual(8);
    expect(ASSIST_FOR).toContain('empieza');
    expect(assistLabel(true)).toBe('Modo Ayudante: sí');
    expect(assistToast(true)).toBe('Ayudante activado: llevarás un gorro con hélice');
    expect(assistToast(false)).toBe('Ayudante desactivado');
    expect(ASSIST_CARD_LINES).toHaveLength(3);
    expect(ASSIST_CARD_LINES.join(' ')).toMatch(/×1,5.*inercia.*un toque.*resbalón.*catapulta.*handicap/);
  });

  it('Modo Ayudante: tapping the switch shows the notice and it fades; "¿Qué es?" opens the card, a tap closes it, nothing leaks outside the lobby', async () => {
    const q = (js: string) => s.eval<any>(`(() => { ${js} })()`);
    const centre = (id: string) =>
      s.eval<[number, number]>(
        `(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`,
      );
    const vis = (id: string) =>
      q(
        `const e = document.getElementById('${id}'); return getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;`,
      );
    await s.load(SCENARIOS.find((x) => x.name === 'captain-lobby-assist')!);
    await s.setViewport(VIEWPORTS[3]!, VIEWPORTS[3]!.insets[0]!);
    expect(await vis('assisttoast')).toBe(false); // the relay's echo (a reconnect) says nothing
    expect(await vis('assisthelp')).toBe(false);
    await s.tap(...(await centre('assist'))); // on -> off
    expect(await q(`return document.getElementById('assisttoast').textContent`)).toBe('Ayudante desactivado');
    await s.tap(...(await centre('assist'))); // off -> on
    expect(await q(`return document.getElementById('assisttoast').textContent`)).toBe('Ayudante activado: llevarás un gorro con hélice');
    expect(await vis('assisttoast')).toBe(true);
    await s.tap(...(await centre('assisthelpopen')));
    expect(await vis('assisthelp')).toBe(true);
    expect(await q(`return document.querySelectorAll('#assisthelp li').length`)).toBe(3);
    expect(await vis('remote')).toBe(true); // the Captain's D-pad is still there, above the card
    await s.tap(...(await centre('assisthelpclose')));
    expect(await vis('assisthelp')).toBe(false);
    await s.eval(`document.body.dataset.assisthelp = 'open'; window.__push({ t: 'phase', phase: 'playing' })`);
    expect(await vis('assisthelp'), 'the round hides the card').toBe(false);
    await waitUntil(async () => !(await vis('assisttoast')), 3500); // same 3.5 s ceiling as before, but it returns as soon as the notice is gone
    expect(await vis('assisttoast'), 'the notice fades by itself').toBe(false);
  }, 60_000);

  it('event notes (#evnote): the text fits inside a 360 px wide screen and a wide font does not push it out', async () => {
    const v = { name: '360x640', w: 360, h: 640, insets: [{ top: 0, right: 0, bottom: 0, left: 0 }] }; // portrait: the pad asks to rotate, the note still shows over it
    await s.load(SCENARIOS.find((x) => x.name === 'play')!);
    for (const font of ['', 'Verdana, sans-serif'])
      for (const kind of EVENT_NOTE_KINDS) {
        await s.setViewport(v, v.insets[0]!);
        const m = await showNote(kind, font);
        const at = `${kind} ${font || 'default font'}`;
        expect(m.vw, at).toBe(360);
        expect(m.shown, `${at}: the note is up`).toBe(true);
        expect(m.sw, `${at}: no sideways overflow`).toBeLessThanOrEqual(m.cw);
        expect(m.boxes, at).toHaveLength(2);
        for (const b of m.boxes) {
          expect(b.x, `${at}: text leaves the left edge`).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w, `${at}: text leaves the right edge`).toBeLessThanOrEqual(360);
        }
      }
  }, 90_000);

  it('event notes (#evnote): over the landscape pad it lets every touch through to A and B and its text stays clear of both buttons', async () => {
    await s.load(SCENARIOS.find((x) => x.name === 'play')!);
    for (const v of VIEWPORTS)
      for (const ins of v.insets)
        for (const kind of EVENT_NOTE_KINDS) {
          await s.setViewport(v, ins);
          const m = await showNote(kind, '');
          const at = `${kind} @ ${v.name} ${insetsName(ins)}`;
          expect(m.shown, `${at}: the note is up`).toBe(true);
          expect(m.pe, `${at}: pointer-events`).toBe('none');
          expect(m.hits, `${at}: A and B take their own touches`).toEqual(['btnA', 'btnB']);
          for (const b of m.boxes)
            for (const k of m.btns)
              expect(b.x + b.w <= k.x || k.x + k.w <= b.x || b.y + b.h <= k.y || k.y + k.h <= b.y, `${at}: text over a button`).toBe(true);
        }
  }, 180_000);
});
