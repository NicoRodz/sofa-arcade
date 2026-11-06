// The on-screen hint that tells the room why the TV is silent: blocked context (click) or muted (M). A hint stuck on screen, or missing when sound is blocked, is a silent game.
import { describe, expect, it } from 'vitest';
import { type HintDoc, createSoundHint } from './sound-hint';

function fakeDoc() {
  const el = { style: { cssText: '', display: '' }, textContent: null as string | null };
  const appended: unknown[] = [];
  const doc: HintDoc = { createElement: () => el, body: { appendChild: (e) => appended.push(e) } };
  return { doc, el, appended };
}

describe('sound hint', () => {
  it('mounts its element on the body and renders once on creation', () => {
    const { doc, el, appended } = fakeDoc();
    createSoundHint(
      () => false,
      () => false,
      doc,
    );
    expect(appended).toEqual([el]);
    expect(el.textContent).toBe('Haz clic para activar el sonido');
  });

  it('asks for a click while the context is blocked, even if also muted', () => {
    const { doc, el } = fakeDoc();
    createSoundHint(
      () => false,
      () => true,
      doc,
    );
    expect(el.textContent).toBe('Haz clic para activar el sonido');
    expect(el.style.display).toBe('');
  });

  it('is hidden while sound runs, and says muted when it runs muted', () => {
    const { doc, el } = fakeDoc();
    let running = false;
    let muted = false;
    const hint = createSoundHint(
      () => running,
      () => muted,
      doc,
    );
    running = true;
    hint.refresh();
    expect(el.style.display).toBe('none');
    expect(el.textContent).toBe('');
    muted = true;
    hint.refresh();
    expect(el.textContent).toBe('Sonido silenciado (M)');
    expect(el.style.display).toBe('');
  });

  it('does not intercept clicks: the click that unlocks audio must reach the page', () => {
    const { doc, el } = fakeDoc();
    createSoundHint(
      () => true,
      () => false,
      doc,
    );
    expect(el.style.cssText).toContain('pointer-events:none');
  });
});
