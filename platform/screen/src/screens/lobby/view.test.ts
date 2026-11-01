import { classMap } from 'lit-html/directives/class-map.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';
import { describe, expect, it } from 'vitest';
import { chipView, diffPills, type JoinView } from './model';
import { captainTemplate, chipTemplate, diffsTemplate, joinTemplate, pillTemplate, playersTemplate } from './view';

const directive = (d: unknown) => (d as { _$litDirective$: unknown })._$litDirective$;
const isDirective = (value: unknown, fn: (...a: never[]) => unknown) =>
  directive(value) === directive((fn as (...a: unknown[]) => unknown)());

describe('lobby templates (no DOM: static parts and bound values of the TemplateResult)', () => {
  it('player card: keeps the structure the stylesheet and the team columns rely on, and binds name / sub / number as values', () => {
    const v = chipView(2, { id: 1, name: '<b>Pablo</b>', color: '#0a0', slot: 2, connected: true, teamId: null }, 1);
    const t = chipTemplate(v, null, null);
    const s = t.strings.join('|');
    for (const k of ['class="av"', 'class="nm"', 'class="sub"', 'class="num"', 'class="mv"', 'title="Pasar al otro equipo"'])
      expect(s).toContain(k);
    expect(s).not.toContain('Pablo'); // lit escapes it: it is a binding, not part of the markup
    expect(t.values.slice(2)).toEqual(['👑 <b>Pablo</b>', expect.stringContaining('listo'), 3]);
  });
  it('player card: the avatar and the badge are node bindings (the same node is kept between renders), in that order inside .av', () => {
    const av = {} as Node,
      badge = {} as Node;
    const t = chipTemplate(chipView(0, undefined, null), av, badge);
    expect(t.values.slice(0, 2)).toEqual([av, badge]);
    expect(t.strings[0]).toBe('<div class="av">');
    expect(t.strings[1]).toBe(''); // nothing between the avatar and the badge
  });
  it('player card: "making" swaps the text for the pen markup (a nested template, not a string)', () => {
    const v = chipView(0, { id: 1, name: 'A', color: '', slot: 0, connected: true, teamId: null, customizing: true }, null);
    const sub = chipTemplate(v, null, null).values[3] as { strings: string[] };
    expect(sub.strings.join('')).toContain('class="pen"');
    expect(typeof chipTemplate(chipView(0, undefined, null), null, null).values[3]).toBe('string');
  });
  it('difficulty pill: class through classMap (the focus ring added by hand survives) and data-diff bound', () => {
    const [easy] = diffPills('easy');
    const t = pillTemplate(easy!);
    expect(t.strings.join('|')).toContain('class="pill ');
    expect(t.strings.join('|')).toContain('data-diff=');
    expect(isDirective(t.values[0], classMap)).toBe(true);
    expect((t.values[0] as { values: [Record<string, boolean>] }).values[0]).toEqual({ sel: true });
    expect(t.values[1]).toBe('easy');
    expect((pillTemplate(diffPills('easy')[1]!).values[0] as { values: [Record<string, boolean>] }).values[0]).toEqual({ sel: false });
  });
  it('difficulty pills are a repeat keyed by id, so a pill keeps its node between renders', () => {
    const pills = diffPills('normal');
    const d = diffsTemplate(pills).values[0] as { values: [unknown[], (p: (typeof pills)[0]) => string] };
    expect(isDirective(d, repeat as never)).toBe(true);
    expect(d.values[0].map(d.values[1] as never)).toEqual(['easy', 'normal', 'hard']);
  });
  it('join card: label, #qr (svg as HTML only when it came), #code and #joinurl as text bindings', () => {
    const j: JoinView = { code: 'AB<C', qrSvg: '<svg/>', url: 'host/c' };
    const t = joinTemplate(j);
    const s = t.strings.join('|');
    for (const k of ['class="lbl"', 'id="qr"', 'id="code"', 'id="joinurl"']) expect(s).toContain(k);
    expect(isDirective(t.values[0], unsafeHTML)).toBe(true);
    expect(t.values.slice(1)).toEqual(['AB<C', 'host/c']);
  });
  it('players heading and Captain notice: the count is a binding; `on` is a classMap on #capbanner', () => {
    expect(playersTemplate('3/8').values).toEqual(['3/8']);
    expect(playersTemplate('3/8').strings.join('|')).toContain('id="playersn"');
    const t = captainTemplate(true);
    expect(t.strings.join('|')).toContain('id="capbanner"');
    expect((t.values[0] as { values: [Record<string, boolean>] }).values[0]).toEqual({ on: true });
    expect((captainTemplate(false).values[0] as { values: [Record<string, boolean>] }).values[0]).toEqual({ on: false });
  });
});
