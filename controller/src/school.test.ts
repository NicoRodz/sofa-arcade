// The phone's card of the Cocina escuela, against a minimal fake DOM: the text and dots follow the screen's messages, the button of the step is lit, and the phone remembers
// (localStorage by token) and says so; "Ya sé" skips this player, "Saltar a todos" is the Captain's 'ok'.
import { describe, expect, it } from 'vitest';
import type { ClientMsg, ServerMsg } from '@party/shared';
import { markDone, phoneKey, readDone, type KV } from '@party/shared/tutorial';
import { createSchoolUi } from './school';

class El {
  textContent = ''; innerHTML = ''; disabled = false; style: Record<string, string> = {}; children: El[] = [];
  private cls = new Set<string>(); private handlers = new Map<string, ((e: { preventDefault(): void }) => void)[]>();
  classList = { toggle: (c: string, on?: boolean) => { if (on ?? !this.cls.has(c)) this.cls.add(c); else this.cls.delete(c); }, contains: (c: string) => this.cls.has(c) };
  addEventListener(t: string, fn: (e: { preventDefault(): void }) => void) { this.handlers.set(t, [...(this.handlers.get(t) ?? []), fn]); }
  tap() { for (const fn of this.handlers.get('pointerup') ?? []) fn({ preventDefault() {} }); }
}
function fakeDoc() {
  const els = new Map<string, El>();
  const get = (id: string) => { let e = els.get(id); if (!e) { e = new El(); els.set(id, e); } return e; };
  const dots = get('schooldots');
  Object.defineProperty(dots, 'innerHTML', { set(v: string) { dots.children = Array.from({ length: (v.match(/<i>/g) ?? []).length }, () => new El()); }, get: () => '' });
  const body = { dataset: {} as Record<string, string> };
  return { doc: { getElementById: get, body } as unknown as Document, el: get, body };
}
const mem = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, get: (k) => m.get(k) ?? null, set: (k, v) => { m.set(k, v); } }; };
type SchoolMsg = Extract<ServerMsg, { t: 'school' }>;
const msg = (o: Partial<SchoolMsg> = {}): SchoolMsg => ({ t: 'school', step: 0, total: 4, text: 'Toma masa del cajón', btn: 'a', ...o });
function rig(o: { captain?: boolean; kv?: KV | null } = {}) {
  const f = fakeDoc(), sent: ClientMsg[] = [], kv = o.kv === undefined ? mem() : o.kv;
  const ui = createSchoolUi({ doc: f.doc, kv, token: 'tok', send: (m) => sent.push(m), isCaptain: () => !!o.captain });
  ui.show(true);
  return { ...f, ui, sent, kv };
}

describe('the school card', () => {
  it('shows the step, the instruction and the dots that are done', () => {
    const r = rig();
    r.ui.apply(msg({ step: 2, text: 'Lleva el tomate picado al horno' }));
    expect(r.el('schoolstep').textContent).toBe('Paso 3 de 4');
    expect(r.el('schooltext').textContent).toBe('Lleva el tomate picado al horno');
    expect(r.el('schooldots').children.map((d) => d.classList.contains('on'))).toEqual([true, true, false, false]);
    expect(r.el('school').classList.contains('done')).toBe(false);
  });
  it('lights the button of the step (A, then B at the knife) and only that one: the button and its label plate', () => {
    const r = rig();
    r.ui.apply(msg({ btn: 'a' }));
    expect([r.el('btnA'), r.el('lblA')].every((e) => e.classList.contains('hl'))).toBe(true);
    expect([r.el('btnB'), r.el('lblB')].some((e) => e.classList.contains('hl'))).toBe(false);
    r.ui.apply(msg({ step: 1, btn: 'b' }));
    expect([r.el('btnB'), r.el('lblB')].every((e) => e.classList.contains('hl'))).toBe(true);
    expect([r.el('btnA'), r.el('lblA')].some((e) => e.classList.contains('hl'))).toBe(false);
  });
  it('done: "Listo", all dots, the skip button off, the green card', () => {
    const r = rig();
    r.ui.apply(msg({ step: 4, done: true, text: 'Aléjate y toca B para correr', btn: 'b' }));
    expect(r.el('schoolstep').textContent).toBe('¡Listo!');
    expect(r.el('schooldots').children.every((d) => d.classList.contains('on'))).toBe(true);
    expect(r.el('school').classList.contains('done')).toBe(true);
    expect((r.el('schoolskip') as unknown as { disabled: boolean }).disabled).toBe(true);
  });
  it('leaving the school clears the lit button, and a late message after that changes nothing', () => {
    const r = rig();
    r.ui.apply(msg({ btn: 'a' }));
    r.ui.show(false);
    expect(r.body.dataset.school).toBe('off');
    expect(r.el('btnA').classList.contains('hl')).toBe(false);
    r.ui.apply(msg({ step: 3, text: 'tarde', btn: 'b' }));
    expect(r.el('schooltext').textContent).not.toBe('tarde');
    expect(r.el('btnB').classList.contains('hl')).toBe(false);
  });
});

describe('what the phone remembers and tells', () => {
  it('finishing the school writes it under the token and tells the relay ONCE (not on every refresh the screen sends)', () => {
    const r = rig();
    expect(readDone(r.kv, phoneKey('tok'))).toBe(false);
    r.ui.apply(msg({ step: 4, done: true }));
    r.ui.apply(msg({ step: 4, done: true }));
    r.ui.apply(msg({ step: 4, done: true }));
    expect(readDone(r.kv, phoneKey('tok'))).toBe(true);
    expect(r.sent).toEqual([{ t: 'schoolDone' }]);
  });
  it('a phone that remembers says so when it (re)joins; one that does not says nothing', () => {
    const kv = mem(); markDone(kv, phoneKey('tok'));
    const a = rig({ kv }); a.ui.announce();
    expect(a.sent).toEqual([{ t: 'schoolDone' }]);
    const b = rig(); b.ui.announce();
    expect(b.sent).toEqual([]);
  });
  it('another phone (another token) does not inherit it', () => {
    const kv = mem(); markDone(kv, phoneKey('somebody-else'));
    const r = rig({ kv }); r.ui.announce();
    expect(r.sent).toEqual([]);
  });
  it('"Ya sé · saltar": tells the relay to skip THIS chef (with the skip flag) and remembers; once done it does nothing', () => {
    const r = rig();
    r.el('schoolskip').tap();
    expect(r.sent).toEqual([{ t: 'schoolDone', skip: true }]);
    expect(readDone(r.kv, phoneKey('tok'))).toBe(true);
    r.ui.apply(msg({ step: 4, done: true }));
    r.sent.length = 0;
    r.el('schoolskip').tap();
    expect(r.sent).toEqual([]);
  });
  it('storage blocked or missing: it still works, it just cannot remember', () => {
    const blocked: KV = { get: () => { throw new Error('x'); }, set: () => { throw new Error('x'); } };
    for (const kv of [blocked, null]) {
      const r = rig({ kv });
      expect(() => r.ui.apply(msg({ step: 4, done: true }))).not.toThrow();
      expect(r.sent).toEqual([{ t: 'schoolDone' }]);
    }
  });
});

describe("the Captain's button", () => {
  it('"Saltar a todos" sends the D-pad\'s ok (Enter on the TV) when this phone holds the crown; nobody else can', () => {
    const cap = rig({ captain: true });
    cap.el('schoolall').tap();
    expect(cap.sent).toEqual([{ t: 'nav', key: 'ok' }]);
    const other = rig({ captain: false });
    other.el('schoolall').tap();
    expect(other.sent).toEqual([]);
  });
  it('the button is only drawn for the Captain', () => {
    expect(rig({ captain: true }).el('schoolall').style.display).toBe('');
    expect(rig({ captain: false }).el('schoolall').style.display).toBe('none');
  });
});
