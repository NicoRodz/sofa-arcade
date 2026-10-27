// The creator in the real page (headless Chrome, fake relay): what the phone sends and stores, and that the layout probe really sees the creator's controls.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCENARIOS, VIEWPORTS, openSession, type Session } from './harness';

let s: Session;
beforeAll(async () => {
  s = await openSession();
}, 60_000);
afterAll(async () => {
  await s?.close();
}, 30_000);

const scenario = (name: string) => SCENARIOS.find((x) => x.name === name)!;
const tap = (sel: string) =>
  s.eval(
    `document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }))`,
  );
const sent = (type: string) =>
  s.eval<{ t: string; ap?: Record<string, number>; done?: boolean }[]>(`window.__sent.filter((m) => m.t === ${JSON.stringify(type)})`);
const open = async (name: string) => {
  await s.load(scenario(name));
  await s.setViewport(VIEWPORTS[0]!, VIEWPORTS[0]!.insets[0]!);
  await new Promise((r) => setTimeout(r, 150));
};

describe('creator in the page', () => {
  it('a new player joins at once with a random look, lands in the creator, and the probe measures its controls', async () => {
    await open('creator-acc');
    const join = (await sent('join'))[0]!;
    expect(join.ap).toMatchObject({ v: 1 });
    expect(await s.eval(`document.body.dataset.creator`)).toBe('open');
    const p = await s.probe();
    for (const sel of ['#creator button', '#creator [data-ov]'] as const)
      expect(p.items.filter((i) => i.sel === sel).length, sel).toBeGreaterThan(5);
    expect(
      p.items.some((i) => i.sel === '#creator [data-ov]' && i.box.w > 100 && i.box.h > 100),
      'the preview canvas',
    ).toBe(true);
    for (const b of p.items.filter((i) => i.sel === '#creator button')) expect(Math.min(b.box.w, b.box.h)).toBeGreaterThanOrEqual(44);
  }, 60_000);

  it('a tap changes the look live (done: false) and Listo saves it, sends done: true and closes the creator', async () => {
    await open('creator-acc');
    await tap('.cr-chip[data-field=hat][data-v="3"]');
    expect((await sent('appearance')).at(-1)).toMatchObject({ done: false, ap: { hat: 3 } });
    await tap('#cr-done');
    const last = (await sent('appearance')).at(-1)!;
    expect(last.done).toBe(true);
    expect(JSON.parse((await s.eval<string>(`localStorage.getItem('pichiclub.ap.v1')`))!)).toEqual(last.ap);
    expect(await s.eval(`document.body.dataset.creator`)).toBe('closed');
  }, 60_000);

  it('with a saved look it asks first: Jugar así sends that look as done, without opening the creator', async () => {
    await open('creator-confirm');
    const join = (await sent('join'))[0]!;
    expect(join.ap).toMatchObject({ g: 1, hat: 3, cl: 4 });
    expect(await s.eval(`document.getElementById('creator').dataset.screen`)).toBe('confirm');
    await tap('#cr-play');
    expect((await sent('appearance')).at(-1)).toMatchObject({ done: true, ap: { hat: 3, cl: 4 } });
    expect(await s.eval(`document.body.dataset.creator`)).toBe('closed');
  }, 60_000);

  it('a twin in the roster shows "Igual que Ana, ¿cambias algo?"; changing something clears it', async () => {
    await open('creator-dup');
    expect(await s.eval(`document.getElementById('cr-dup').textContent`)).toBe('Igual que Ana, ¿cambias algo?');
    await tap('.cr-chip[data-field=cl]:not([aria-pressed=true])');
    await new Promise((r) => setTimeout(r, 50));
    expect(await s.eval(`document.getElementById('cr-dup').hidden`)).toBe(true);
  }, 60_000);

  it('Editar personaje (lobby) reopens the creator; a match starting closes it', async () => {
    await open('creator-edit');
    expect(await s.eval(`document.body.dataset.creator`)).toBe('open');
    await s.eval(`window.__push({ t: 'phase', phase: 'playing' })`);
    expect(await s.eval(`document.body.dataset.creator`)).toBe('closed');
  }, 60_000);

  it('Chromium is left clean: no page errors', () => {
    expect(s.pageErrors()).toEqual([]);
  });
});
