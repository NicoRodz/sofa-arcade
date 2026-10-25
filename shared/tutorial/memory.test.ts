import { describe, expect, it } from 'vitest';
import { kvOf, markDone, phoneKey, readDone, roomKey, shouldOffer, type KV } from './memory';

const mem = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, get: (k) => m.get(k) ?? null, set: (k, v) => { m.set(k, v); } }; };
const blocked: KV = { get: () => { throw new Error('SecurityError'); }, set: () => { throw new Error('SecurityError'); } };

describe('what the school remembers', () => {
  it('a room and a phone remember apart: the room by its code, the phone by its token', () => {
    const kv = mem();
    expect(readDone(kv, roomKey('ABCD'))).toBe(false);
    markDone(kv, roomKey('ABCD'));
    expect(readDone(kv, roomKey('ABCD'))).toBe(true);
    expect(readDone(kv, roomKey('WXYZ'))).toBe(false); // another room starts again
    expect(readDone(kv, phoneKey('tok1'))).toBe(false);
    markDone(kv, phoneKey('tok1'));
    expect(readDone(kv, phoneKey('tok1'))).toBe(true);
    expect(readDone(kv, phoneKey('tok2'))).toBe(false); // another phone starts again
    expect(roomKey('x')).not.toBe(phoneKey('x'));
  });
  it('only the value the school writes counts as done', () => {
    const kv = mem();
    kv.set(roomKey('A'), '0'); kv.set(roomKey('B'), '');
    expect(readDone(kv, roomKey('A'))).toBe(false);
    expect(readDone(kv, roomKey('B'))).toBe(false);
  });
  it('blocked or missing storage never throws: the school is simply offered again', () => {
    expect(readDone(blocked, 'k')).toBe(false);
    expect(() => markDone(blocked, 'k')).not.toThrow();
    expect(readDone(null, 'k')).toBe(false);
    expect(() => markDone(undefined, 'k')).not.toThrow();
    expect(kvOf(null)).toBeNull();
  });
  it('wraps a Web Storage object', () => {
    const store = new Map<string, string>();
    const kv = kvOf({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } })!;
    markDone(kv, 'k');
    expect(store.get('k')).toBe('1');
    expect(readDone(kv, 'k')).toBe(true);
  });
});

describe('when the school is offered at "A cocinar"', () => {
  const two = [{}, {}];
  it('the first time, in the pizza game, with somebody who has not done it', () => {
    expect(shouldOffer({ pizzas: true, sessionDone: false, connected: two })).toBe(true);
    expect(shouldOffer({ pizzas: true, sessionDone: false, connected: [{ school: true }, {}] })).toBe(true); // one phone knows it, the other does not
  });
  it('not once the room did or skipped it', () => {
    expect(shouldOffer({ pizzas: true, sessionDone: true, connected: two })).toBe(false);
  });
  it('not when every connected phone already knows it', () => {
    expect(shouldOffer({ pizzas: true, sessionDone: false, connected: [{ school: true }, { school: true }] })).toBe(false);
  });
  it('not in another game, and not with nobody connected', () => {
    expect(shouldOffer({ pizzas: false, sessionDone: false, connected: two })).toBe(false);
    expect(shouldOffer({ pizzas: true, sessionDone: false, connected: [] })).toBe(false);
  });
});
