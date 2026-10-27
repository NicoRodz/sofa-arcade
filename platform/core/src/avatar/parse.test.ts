import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../protocol';
import { APPEARANCE_MAX_KEYS, parseAppearanceMsg, parseRawAppearance } from './parse';

const ap = { v: 1, g: 0, s: 1, hc: 2, sk: 1, hat: 0, gl: 0, bk: 0, cl: 8 };
const join = (extra: object) => JSON.stringify({ t: 'join', name: 'Ana', token: 'tok', ...extra });

describe('avatar parsers', () => {
  it('parseRawAppearance keeps a plain object and drops the rest (including one with too many keys)', () => {
    expect(parseRawAppearance(ap)).toEqual(ap);
    for (const bad of [
      null,
      undefined,
      3,
      'x',
      [],
      [ap],
      Object.fromEntries(Array.from({ length: APPEARANCE_MAX_KEYS + 1 }, (_, i) => [`k${i}`, 1])),
    ])
      expect(parseRawAppearance(bad)).toBeUndefined();
  });
  it('parseAppearanceMsg: done is true only when exactly true; a bad ap drops the message', () => {
    expect(parseAppearanceMsg({ ap, done: true })).toEqual({ ap, done: true });
    for (const d of [undefined, 1, 'true', null]) expect(parseAppearanceMsg({ ap, done: d })).toEqual({ ap, done: false });
    expect(parseAppearanceMsg({ ap: 5, done: true })).toBeNull();
    expect(parseAppearanceMsg({})).toBeNull();
  });
  it('join carries ap when it is an object, and still parses (as before) when it is not or absent: never rejected for its look', () => {
    expect(parseClientMessage(join({ ap }))).toEqual({ t: 'join', name: 'Ana', token: 'tok', ap });
    for (const bad of [5, 'x', null, [1], { ...Array.from({ length: 30 }, () => 1) }]) {
      const m = parseClientMessage(join({ ap: bad }));
      expect(m).toEqual({ t: 'join', name: 'Ana', token: 'tok' });
    }
    expect(parseClientMessage(join({}))).toEqual({ t: 'join', name: 'Ana', token: 'tok' });
  });
  it('appearance message parses through parseClientMessage and drops a malformed one', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'appearance', ap, done: true }))).toEqual({ t: 'appearance', ap, done: true });
    expect(parseClientMessage(JSON.stringify({ t: 'appearance', ap }))).toEqual({ t: 'appearance', ap, done: false });
    expect(parseClientMessage(JSON.stringify({ t: 'appearance', ap: 'x', done: true }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'appearance', playerId: 9, from: 3, ap, done: false }))).toEqual({
      t: 'appearance',
      ap,
      done: false,
    }); // no id taken from the payload
  });
  it('a __proto__ key in the raw ap arrives as an own, harmless property', () => {
    const m = parseClientMessage(join({ ap: JSON.parse('{"__proto__":{"hc":4},"g":1}') }));
    expect(({} as Record<string, unknown>).hc).toBeUndefined();
    expect(m).toMatchObject({ t: 'join' });
  });
});
