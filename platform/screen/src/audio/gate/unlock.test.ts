import { describe, expect, it } from 'vitest';
import { GESTURE_EVENTS, createAudioGate } from './unlock';

type State = 'suspended' | 'running' | 'closed';
function fakeCtx(state: State = 'suspended') {
  const c = {
    state,
    resumes: 0,
    resume() {
      c.resumes++;
      c.state = 'running';
      return Promise.resolve();
    },
  };
  return c;
}
const asCtx = (c: ReturnType<typeof fakeCtx>) => c as unknown as AudioContext;
const fire = (t: EventTarget, type: string) => t.dispatchEvent(new Event(type));

describe('audio gate', () => {
  it('the first gesture resumes a suspended context, whichever kind of gesture it is', () => {
    for (const type of GESTURE_EVENTS) {
      const target = new EventTarget();
      const gate = createAudioGate(target);
      const ctx = fakeCtx();
      gate.register(asCtx(ctx));
      expect(ctx.state).toBe('suspended'); // no gesture yet: nothing resumed
      fire(target, type);
      expect(ctx.state).toBe('running');
      expect(gate.gestured()).toBe(true);
    }
  });
  it('a gesture in the menu unlocks a context that registers later (Manchazo creates its context on the first lobby frame)', () => {
    const target = new EventTarget();
    const gate = createAudioGate(target);
    fire(target, 'pointerdown');
    const late = fakeCtx();
    gate.register(asCtx(late));
    expect(late.resumes).toBe(1);
    expect(late.state).toBe('running');
  });
  it('a later gesture resumes a context the browser suspended again, and leaves a running one alone', () => {
    const target = new EventTarget();
    const gate = createAudioGate(target);
    const ctx = fakeCtx();
    gate.register(asCtx(ctx));
    fire(target, 'keydown');
    expect(ctx.resumes).toBe(1);
    fire(target, 'keydown'); // running: no second resume
    expect(ctx.resumes).toBe(1);
    ctx.state = 'suspended';
    fire(target, 'click');
    expect(ctx.resumes).toBe(2);
    expect(ctx.state).toBe('running');
  });
  it('one gesture resumes every registered context', () => {
    const target = new EventTarget();
    const gate = createAudioGate(target);
    const a = fakeCtx();
    const b = fakeCtx();
    gate.register(asCtx(a));
    gate.register(asCtx(b));
    fire(target, 'touchstart');
    expect([a.state, b.state]).toEqual(['running', 'running']);
  });
  it('a closed context is not resumed, and a rejected resume does not throw', () => {
    const target = new EventTarget();
    const gate = createAudioGate(target);
    const closed = fakeCtx('closed');
    const rejecting = { state: 'suspended', resume: () => Promise.reject(new Error('blocked')) } as unknown as AudioContext;
    gate.register(asCtx(closed));
    gate.register(rejecting);
    expect(() => fire(target, 'pointerdown')).not.toThrow();
    expect(closed.resumes).toBe(0);
  });
  it('dispose stops listening', () => {
    const target = new EventTarget();
    const gate = createAudioGate(target);
    const ctx = fakeCtx();
    gate.register(asCtx(ctx));
    gate.dispose();
    fire(target, 'pointerdown');
    expect(ctx.state).toBe('suspended');
    expect(gate.gestured()).toBe(false);
  });
});
