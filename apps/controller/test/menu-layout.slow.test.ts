// The Captain's touch menu in headless Chrome (touch emulation, safe-area insets): the list, the map picker (both pages), the confirmation, the refusal notice
// and each of them with a wide font, from 320x568 portrait to 932x430 landscape. Measured in the page: every touchable is >= 44px, nothing overlaps or leaves the
// screen sideways, the last control of the list can be scrolled into view, the start button clears the home indicator, and "Volver" of the confirmation sits where
// ¡A cocinar! of the list does. Then the taps: what each one sends, and the D-pad behind "Mando".
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { snapshot } from '../../../platform/controller/src/menu/fixture';
import type { Scenario, Session } from './harness';

// layout.slow.test.ts runs in parallel with this file and holds PG_PORT / PG_CDP_PORT: this one takes the next pair (the harness reads them when it loads).
process.env.PG_PORT = String(Number(process.env.PG_PORT ?? 3600) + 1);
process.env.PG_CDP_PORT = String(Number(process.env.PG_CDP_PORT ?? 9366) + 1);
const { ORIENTATIONS, insetsName, openSession } = await import('./harness');

let s: Session;
beforeAll(async () => {
  s = await openSession();
}, 60_000);
afterAll(async () => {
  await s?.close();
}, 30_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WIDE = `document.documentElement.style.setProperty('--font', 'Verdana, sans-serif'); window.dispatchEvent(new Event('resize'))`;
const tapEl = (sel: string) =>
  `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('no ${sel}'); e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); })()`;
const player = { t: 'joined', player: { id: 1, name: 'Nico', color: '#E63B2E', slot: 0 }, room: 'main' };
const config = {
  t: 'config',
  game: 'pizzas',
  difficulty: 'normal',
  map: '1',
  seed: 1,
  controls: { stick: { label: 'Mover', icon: 'move' }, btn1: { label: 'Tomar', icon: 'grab' }, btn2: { label: 'Picar', icon: 'chop' } },
  howTo: { steps: [{ icon: 'crate', text: 'Toma masa' }] },
};
const open = (name: string, extra: string, over = {}): { sc: Scenario; steps: string } => ({
  sc: {
    name,
    msgs: [player, config, { t: 'phase', phase: 'lobby' }, { t: 'captain', playerId: 1 }, { t: 'menu', ...snapshot(over) }],
    after: `document.body.dataset.howto = 'closed'`,
  },
  steps: extra,
});

// in-page measurement
const MEASURE = `(() => {
  const vw = innerWidth, vh = innerHeight, bad = [];
  const root = document.getElementById('cmenu');
  if (!root || getComputedStyle(root).display === 'none') return { bad: ['menu not showing'], go: null };
  const R = (e) => e.getBoundingClientRect();
  const body = root.querySelector('.cm-body'), br = R(body);
  const visible = (e) => { const r = R(e); return r.width > 0 && r.height > 0 && r.bottom > br.top - 0.5 + 0 && r.top < br.bottom + 0.5 || !body.contains(e); };
  const touch = [...root.querySelectorAll('[data-cm]')].filter((e) => getComputedStyle(e).display !== 'none' && R(e).width > 0);
  for (const e of touch) { const r = R(e); if (Math.min(r.width, r.height) < 43.5) bad.push('small ' + (e.dataset.cm || '') + ' ' + e.textContent.trim().slice(0, 14) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }
  for (const e of root.querySelectorAll('*')) { const r = R(e); if (r.width && (r.left < -0.5 || r.right > vw + 0.5) && !(body.contains(e) && !visible(e))) bad.push('off-screen ' + e.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); }
  if (document.documentElement.scrollWidth > vw + 0.5) bad.push('page scrolls sideways');
  if (body.scrollWidth > body.clientWidth + 1) bad.push('list scrolls sideways');
  const vis = touch.filter((e) => !body.contains(e) || (R(e).top >= br.top - 0.5 && R(e).bottom <= br.bottom + 0.5));
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const a = R(vis[i]), b = R(vis[j]);
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 1 && h > 1) bad.push('overlap ' + vis[i].textContent.trim().slice(0, 12) + ' / ' + vis[j].textContent.trim().slice(0, 12));
  }
  const inBody = touch.filter((e) => body.contains(e)), last = inBody[inBody.length - 1];
  if (last) { last.scrollIntoView({ block: 'end' }); const r = R(last), b2 = R(body); if (r.bottom > b2.bottom + 1 || r.top < b2.top - 1) bad.push('last control not reachable'); body.scrollTop = 0; }
  const go = root.querySelector('.cm-go'), gr = go ? R(go) : null;
  if (gr) { const sb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sb')) || 0; if (gr.bottom > vh + 0.5) bad.push('start button below the screen'); }
  for (const e of root.querySelectorAll('.cm-title, .cm-title b, .cm-title span, .cm-notice')) if (e.scrollWidth > e.clientWidth + 1) bad.push('clipped ' + e.className);
  if (touch.length < 3) bad.push('nothing measured');
  return { bad, go: gr ? { x: gr.left, y: gr.top, w: gr.width, h: gr.height } : null };
})()`;

type Measured = { bad: string[]; go: { x: number; y: number; w: number; h: number } | null };
const STATES: { name: string; wide?: boolean; steps: string[]; over?: object }[] = [
  { name: 'list', steps: [] },
  { name: 'list-wide-font', wide: true, steps: [] },
  { name: 'maps-page-1', steps: [tapEl('[data-cm=maps]')] },
  { name: 'maps-page-2', steps: [tapEl('[data-cm=maps]'), tapEl('[data-cm=tab][data-val=series]')] },
  { name: 'maps-wide-font', wide: true, steps: [tapEl('[data-cm=maps]')] },
  { name: 'confirm', steps: [tapEl('.cm-go'), 'WAIT'] },
  { name: 'confirm-wide-font', wide: true, steps: [tapEl('.cm-go'), 'WAIT'] },
  { name: 'refused', steps: ["window.__push({ t: 'menuErr', rev: 3, code: 'stale', msg: 'Cambió la configuración: revisa y confirma' })"] },
  {
    name: 'refused-wide-font',
    wide: true,
    steps: ["window.__push({ t: 'menuErr', rev: 3, code: 'stale', msg: 'Cambió la configuración: revisa y confirma' })"],
  },
  {
    name: 'start-off',
    steps: [],
    over: { primary: { id: 'start', label: '¡A cocinar!', enabled: false, reason: 'Esperando jugadores', summary: [] } },
  },
];

describe('Captain menu layout', () => {
  for (const [orientation, vps] of Object.entries(ORIENTATIONS)) {
    it(`${orientation}: every state is tappable (>= 44px), without overlaps, sideways scroll or an unreachable control`, async () => {
      const bad: string[] = [];
      let probes = 0;
      for (const st of STATES) {
        const { sc } = open(st.name, '', st.over);
        await s.load(sc);
        if (st.wide) await s.eval(WIDE);
        for (const step of st.steps) {
          if (step === 'WAIT') await sleep(620);
          else await s.eval(step);
          await sleep(40);
        }
        let listGo: Measured['go'] = null;
        for (const v of vps)
          for (const ins of v.insets) {
            await s.setViewport(v, ins);
            await sleep(30);
            const m = await s.eval<Measured>(MEASURE);
            probes++;
            for (const b of m.bad) bad.push(`${st.name} @ ${v.name} ${insetsName(ins)}: ${b}`);
            if (st.name === 'list') listGo = m.go;
            else if (st.name === 'confirm' && listGo) void 0;
          }
      }
      expect(s.pageErrors()).toEqual([]);
      expect(probes).toBeGreaterThanOrEqual(orientation === 'landscape' ? 100 : 50);
      expect(bad).toEqual([]);
    }, 280_000);
  }

  it('"Volver" of the confirmation sits where ¡A cocinar! of the list does (a double tap cancels instead of starting)', async () => {
    for (const vps of Object.values(ORIENTATIONS))
      for (const v of vps) {
        await s.load(open('same-place', '').sc);
        await s.setViewport(v, v.insets[0]!);
        const a = (await s.eval<Measured>(MEASURE)).go!;
        await s.eval(tapEl('.cm-go'));
        await sleep(60);
        const b = (await s.eval<Measured>(MEASURE)).go!;
        expect(Math.abs(a.x - b.x), v.name).toBeLessThanOrEqual(8);
        expect(Math.abs(a.y - b.y), v.name).toBeLessThanOrEqual(8);
        expect(Math.abs(a.w - b.w), v.name).toBeLessThanOrEqual(8);
        expect(Math.abs(a.h - b.h), v.name).toBeLessThanOrEqual(8);
      }
  }, 120_000);
});

describe('Captain menu behaviour', () => {
  const sent = () => s.eval<{ t: string; [k: string]: unknown }[]>(`(window.__sent || []).filter((m) => m.t !== 'ping')`);
  const fresh = async (over = {}) => {
    await s.load(open('beh', '', over).sc);
    await s.setViewport(ORIENTATIONS.landscape[3]!, { top: 0, right: 0, bottom: 0, left: 0 });
    await s.eval(`window.__sent = []`);
  };

  it('announces the capability when it joins, and shows the form (not the D-pad) once a snapshot is in hand', async () => {
    await s.load(open('caps', '').sc);
    const j = await s.eval<unknown[]>(`(window.__sent || []).filter((m) => m.t === 'join')`);
    expect(j[0]).toMatchObject({ t: 'join', caps: ['menu1'] });
    expect(await s.eval<string>('document.body.dataset.menu')).toBe('on');
    expect(await s.eval<string>(`getComputedStyle(document.getElementById('remote')).display`)).toBe('none');
  });

  it('shows the D-pad as before when no snapshot comes (an older screen, a game without a form)', async () => {
    await s.load({
      name: 'nomenu',
      msgs: [player, config, { t: 'phase', phase: 'lobby' }, { t: 'captain', playerId: 1 }],
      after: `document.body.dataset.howto = 'closed'`,
    });
    expect(await s.eval<string>('document.body.dataset.menu')).toBe('off');
    expect(await s.eval<string>('document.body.dataset.remote')).toBe('on');
    expect(await s.eval<string>(`getComputedStyle(document.getElementById('remote')).display`)).toBe('grid');
  });

  it('a tap sends an absolute value with the revision it saw; a toggle sends a boolean; the tab and "Cambiar mapa" send focus', async () => {
    await fresh();
    await s.eval(tapEl('[data-row=difficulty][data-val=hard]'));
    await s.eval(tapEl('[data-row=events][data-val="0"]'));
    await s.eval(tapEl('[data-cm=maps]'));
    await s.eval(tapEl('[data-cm=tab][data-val=series]'));
    await s.eval(tapEl('[data-row=map][data-val="20"]'));
    expect(await sent()).toEqual([
      { t: 'menuAct', rev: 3, act: 'set', row: 'difficulty', value: 'hard' },
      { t: 'menuAct', rev: 3, act: 'set', row: 'events', value: false },
      { t: 'menuAct', rev: 3, act: 'focus', row: 'map', value: 'classic' },
      { t: 'menuAct', rev: 3, act: 'focus', row: 'map', value: 'series' },
      { t: 'menuAct', rev: 3, act: 'set', row: 'map', value: '20' },
    ]);
  });

  it('a locked option sends nothing and says why', async () => {
    await fresh();
    await s.eval(tapEl('[data-row=mode][data-val=versus]'));
    expect(await sent()).toEqual([]);
    expect(await s.eval<string>(`document.querySelector('.cm-notice').textContent`)).toBe('necesita 4 jugadores');
  });

  it('starting takes two taps: nothing is sent by the first; "Sí" is dead for 500 ms; then it sends start with the revision; Volver cancels', async () => {
    await fresh();
    await s.eval(tapEl('.cm-go'));
    await s.eval(tapEl('[data-cm=yes]')); // too early (and a disabled button takes no tap)
    await sleep(120);
    await s.eval(tapEl('[data-cm=yes]'));
    expect(await sent()).toEqual([]);
    await sleep(520);
    await s.eval(tapEl('[data-cm=back]'));
    expect(await sent()).toEqual([]);
    expect(await s.eval<boolean>(`!!document.querySelector('.cm-go[data-cm=go]')`)).toBe(true);
    await s.eval(tapEl('.cm-go'));
    await sleep(620);
    await s.eval(tapEl('[data-cm=yes]'));
    expect(await sent()).toEqual([{ t: 'menuAct', rev: 3, act: 'start' }]);
  });

  it('"?" asks the big screen for the how-to card with the old nav message', async () => {
    await fresh();
    await s.eval(tapEl('[data-cm=help]'));
    expect(await sent()).toEqual([{ t: 'nav', key: 'help' }]);
  });

  it('a new snapshot repaints the list and keeps the thumb where it was', async () => {
    await fresh();
    await s.setViewport(
      { name: 'short', w: 568, h: 320, insets: [{ top: 0, right: 0, bottom: 0, left: 0 }] },
      { top: 0, right: 0, bottom: 0, left: 0 },
    );
    await s.eval(`document.querySelector('.cm-body').scrollTop = 60`);
    await s.eval(`window.__push(${JSON.stringify({ t: 'menu', ...snapshot({ rev: 4 }) })})`);
    const top = await s.eval<number>(`document.querySelector('.cm-body').scrollTop`);
    expect(top).toBeGreaterThan(0);
  });

  it('"Mando" brings the D-pad back and "Menú" returns to the form; losing the crown or leaving the lobby closes it', async () => {
    await fresh();
    await s.eval(tapEl('[data-cm=pad]'));
    expect(await s.eval<string>('document.body.dataset.menu')).toBe('pad');
    expect(await s.eval<string>(`getComputedStyle(document.getElementById('remote')).display`)).toBe('grid');
    await s.eval(tapEl('#cmenu-back'));
    expect(await s.eval<string>('document.body.dataset.menu')).toBe('on');
    await s.eval(`window.__push({ t: 'captain', playerId: 2 })`);
    expect(await s.eval<string>('document.body.dataset.menu')).toBe('off');
    await s.eval(`window.__push({ t: 'captain', playerId: 1 })`);
    expect(await s.eval<string>('document.body.dataset.menu')).toBe('off'); // the snapshot died with the crown: the screen sends the next one
    await s.eval(`window.__push(${JSON.stringify({ t: 'menu', ...snapshot({ rev: 5 }) })})`);
    expect(await s.eval<string>('document.body.dataset.menu')).toBe('on');
    await s.eval(`window.__push({ t: 'phase', phase: 'playing' })`);
    expect(await s.eval<string>('document.body.dataset.menu')).toBe('off');
  });

  it('a phone that is not the Captain never shows the form, even if a snapshot reaches it', async () => {
    await s.load({
      name: 'notcap',
      msgs: [player, config, { t: 'phase', phase: 'lobby' }, { t: 'captain', playerId: 2 }, { t: 'menu', ...snapshot() }],
      after: `document.body.dataset.howto = 'closed'`,
    });
    expect(await s.eval<string>('document.body.dataset.menu')).toBe('off');
    expect(await s.eval<string>(`document.getElementById('waitmsg').textContent`)).toBe('Elige el Capitán');
  });

  it('the list scrolls by touch (the page-wide touchmove guard lets a data-scroll list through)', async () => {
    await fresh();
    await s.setViewport(
      { name: 'short', w: 568, h: 320, insets: [{ top: 0, right: 0, bottom: 0, left: 0 }] },
      { top: 0, right: 0, bottom: 0, left: 0 },
    );
    const prevented = await s.eval<boolean>(
      `(() => { const b = document.querySelector('.cm-body'); const ev = new Event('touchmove', { bubbles: true, cancelable: true }); b.dispatchEvent(ev); return ev.defaultPrevented; })()`,
    );
    expect(prevented).toBe(false);
    const other = await s.eval<boolean>(
      `(() => { const ev = new Event('touchmove', { bubbles: true, cancelable: true }); document.getElementById('cmenu').querySelector('.cm-head').dispatchEvent(ev); return ev.defaultPrevented; })()`,
    );
    expect(other).toBe(true); // everything else still cannot scroll the page
  });
});
