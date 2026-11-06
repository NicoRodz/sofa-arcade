// The phone that joined a versus round after it started has no chef: it must not show a pad, it says when it plays (watch.ts).
import { describe, expect, it, vi } from 'vitest';
import type { Phase } from '@pichi/core';
import { createWatch, waitText } from './watch';

const setup = (phase: Phase, team: number | null) => {
  const st = { phase, team };
  const view = vi.fn();
  const renderCaptain = vi.fn();
  const w = createWatch({ phase: () => st.phase, myTeam: () => st.team, view, renderCaptain });
  return { st, view, renderCaptain, w };
};

describe('waitText', () => {
  it('says what the phone is waiting for, in order: not joined, watching, captain, everyone else', () => {
    expect(waitText(false, true, true)).toBe('Esperando que inicie la partida');
    expect(waitText(true, true, true)).toBe('Entras en la próxima ronda');
    expect(waitText(true, false, true)).toBe('Eres el Capitán');
    expect(waitText(true, false, false)).toBe('Elige el Capitán');
  });
});

describe('watching', () => {
  it('only a phone with no team, in a versus round that is being played', () => {
    const { st, w } = setup('playing', null);
    expect(w.watching()).toBe(false); // the phase did not say versus yet
    w.setVersusRound(true);
    expect(w.watching()).toBe(true);
    st.team = 0;
    expect(w.watching()).toBe(false); // dealt into a team
    st.team = null;
    st.phase = 'lobby';
    expect(w.watching()).toBe(false); // the round is over
    st.phase = 'playing';
    w.setVersusRound(false);
    expect(w.watching()).toBe(false); // a coop round has no teams: nobody watches
  });
});

describe('show', () => {
  it('a live round shows the pad, or the lobby view for a watching phone, and redraws the captain', () => {
    const { w, view, renderCaptain } = setup('playing', 1);
    w.show(true, 'playing');
    expect(view).toHaveBeenLastCalledWith('playing');
    expect(renderCaptain).toHaveBeenCalledTimes(1);
    const t = setup('playing', null);
    t.w.setVersusRound(true);
    t.w.show(true, 'playing');
    expect(t.view).toHaveBeenLastCalledWith('lobby');
  });
  it('a phase that is not a live round shows the view of that phase', () => {
    const { w, view } = setup('results', null);
    w.setVersusRound(true);
    w.show(false, 'results');
    expect(view).toHaveBeenCalledWith('results');
  });
});

describe('refresh', () => {
  it('while a round is being played it repaints the view', () => {
    const { w, view } = setup('playing', null);
    w.setVersusRound(true);
    w.refresh();
    expect(view).toHaveBeenCalledWith('lobby');
  });
  it('outside the round it does nothing', () => {
    const { w, view, renderCaptain } = setup('lobby', null);
    w.refresh();
    expect(view).not.toHaveBeenCalled();
    expect(renderCaptain).not.toHaveBeenCalled();
  });
});
