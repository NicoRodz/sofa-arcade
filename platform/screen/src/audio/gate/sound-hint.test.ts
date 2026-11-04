import { describe, expect, it } from 'vitest';
import { createSoundHint, type HintDoc } from './sound-hint';

function fakeDoc() {
  const el = { style: { cssText: '', display: '' }, textContent: null as string | null };
  const body: unknown[] = [];
  const doc: HintDoc = { createElement: () => el, body: { appendChild: (e) => body.push(e) } };
  return { el, body, doc };
}

describe('sound hint', () => {
  it('asks for a click while the context is blocked, even when muted', () => {
    const { el, body, doc } = fakeDoc();
    let running = false;
    let muted = false;
    const hint = createSoundHint(
      () => running,
      () => muted,
      doc,
    );
    expect(body).toHaveLength(1);
    expect(el.textContent).toBe('Haz clic para activar el sonido');
    expect(el.style.display).toBe('');
    muted = true;
    hint.refresh();
    expect(el.textContent).toBe('Haz clic para activar el sonido');
    running = true;
    hint.refresh();
    expect(el.textContent).toBe('Sonido silenciado (M)');
  });
  it('hides itself once the context runs and the sound is not muted', () => {
    const { el, doc } = fakeDoc();
    let running = false;
    const hint = createSoundHint(
      () => running,
      () => false,
      doc,
    );
    running = true;
    hint.refresh();
    expect(el.textContent).toBe('');
    expect(el.style.display).toBe('none');
  });
});
