import { describe, expect, it } from 'vitest';
import { snapshot } from './fixture';
import {
  CONFIRM_DELAY_MS,
  FLASH_MS,
  flashing,
  showIntro,
  toggleFit,
  touched,
  visibleItems,
  NOTICE_MS,
  actMsg,
  ask,
  closeMenu,
  confirmReady,
  currentTab,
  formUp,
  goBack,
  initialUi,
  noticeOf,
  onErr,
  onSnapshot,
  openMaps,
  padUp,
  pickedOf,
  refuse,
  setPad,
  setTab,
} from './state';

const up = (rev = 3) => onSnapshot(initialUi(), snapshot({ rev }), 0);

describe('snapshots', () => {
  it('keeps the newest and ignores one that arrives late', () => {
    const ui = onSnapshot(up(5), snapshot({ rev: 4 }), 0);
    expect(ui.snap?.rev).toBe(5);
  });
  it('closes the confirmation (with the reason) when the round can no longer start', () => {
    let ui = ask(up(), 0);
    expect(ui.view).toBe('confirm');
    ui = onSnapshot(
      ui,
      snapshot({ rev: 4, primary: { id: 'start', label: '¡A cocinar!', enabled: false, reason: 'Esperando jugadores', summary: [] } }),
      10,
    );
    expect(ui.view).toBe('main');
    expect(noticeOf(ui, 11)).toBe('Esperando jugadores');
  });
  it('leaves the maps view when the grid disappears, and forgets a tab that no longer exists', () => {
    const ui = setTab(openMaps(up()), 'series');
    const gone = onSnapshot(ui, snapshot({ rev: 4, rows: snapshot().rows.filter((r) => r.kind !== 'grid') }), 0);
    expect(gone.view).toBe('main');
    expect(onSnapshot(setTab(up(), 'nope'), snapshot({ rev: 4 }), 0).tab).toBeNull();
  });
});

describe('views', () => {
  it('maps open on the group that holds the picked map, or the one chosen by tab', () => {
    expect(currentTab(openMaps(up()))).toBe('classic');
    expect(currentTab(setTab(openMaps(up()), 'series'))).toBe('series');
    const s = snapshot();
    s.rows.find((r) => r.id === 'map')!.value = '20';
    expect(currentTab(onSnapshot(initialUi(), s, 0))).toBe('series');
  });
  it('pickedOf names the picked map, or an extra like "Aleatorio"', () => {
    const grid = snapshot().rows.find((r) => r.id === 'map')!;
    expect(pickedOf(grid)).toEqual({ label: 'Cocina Grande', players: '2-4', stars: 2 });
    expect(pickedOf({ ...grid, value: 'auto' })).toEqual({ label: 'Aleatorio' });
  });
  it('start asks first: the confirmation opens only if the screen allows it, and "Sí" wakes after 500 ms', () => {
    const ui = ask(up(), 1000);
    expect(ui.view).toBe('confirm');
    expect(confirmReady(ui, 1000 + CONFIRM_DELAY_MS - 1)).toBe(false);
    expect(confirmReady(ui, 1000 + CONFIRM_DELAY_MS)).toBe(true);
    expect(goBack(ui).view).toBe('main');
    const off = ask(
      onSnapshot(
        initialUi(),
        snapshot({ primary: { id: 'start', label: '¡A cocinar!', enabled: false, reason: 'Esperando jugadores', summary: [] } }),
        0,
      ),
      5,
    );
    expect(off.view).toBe('main');
    expect(noticeOf(off, 6)).toBe('Esperando jugadores');
  });
  it('a notice lasts 3 s', () => {
    const ui = refuse(up(), 'necesita 4 jugadores', 100);
    expect(noticeOf(ui, 100 + NOTICE_MS - 1)).toBe('necesita 4 jugadores');
    expect(noticeOf(ui, 100 + NOTICE_MS)).toBe('');
  });
});

describe('what the screen says back', () => {
  it('stale / disabled: a notice, and the confirmation closes; notCaptain: the form closes', () => {
    const conf = ask(up(), 0);
    const stale = onErr(conf, { rev: 3, code: 'stale', msg: 'Cambió la configuración: revisa y confirma' }, 5);
    expect(stale.view).toBe('main');
    expect(noticeOf(stale, 6)).toMatch(/Cambió/);
    const maps = onErr(openMaps(up()), { rev: 3, code: 'disabled', msg: 'necesita 6+ jugadores' }, 5);
    expect(maps.view).toBe('maps'); // a refused map does not throw the Captain out of the picker
    expect(onErr(up(), { rev: 3, code: 'notCaptain', msg: 'x' }, 0).snap).toBeNull();
  });
  it('losing the crown or leaving the lobby drops the form but keeps the "Mando" choice', () => {
    const ui = closeMenu(setPad(ask(up(), 0), true));
    expect(ui.snap).toBeNull();
    expect(ui.view).toBe('main');
    expect(ui.pad).toBe(true);
  });
});

describe('what the form says to the screen', () => {
  it('every touch carries the revision of the snapshot the finger saw, and absolute values', () => {
    expect(actMsg(up(7), 'set', 'difficulty', 'hard')).toEqual({ rev: 7, act: 'set', row: 'difficulty', value: 'hard' });
    expect(actMsg(up(7), 'set', 'events', false)).toEqual({ rev: 7, act: 'set', row: 'events', value: false });
    expect(actMsg(up(7), 'start')).toEqual({ rev: 7, act: 'start' });
    expect(actMsg(initialUi(), 'start')).toBeNull();
  });
  it('the form is up only for the Captain in the lobby with a snapshot and no "Mando"; "Mando" shows the way back', () => {
    expect(formUp(up(), true, 'lobby')).toBe(true);
    expect(formUp(up(), false, 'lobby')).toBe(false);
    expect(formUp(up(), true, 'playing')).toBe(false);
    expect(formUp(initialUi(), true, 'lobby')).toBe(false);
    expect(formUp(setPad(up(), true), true, 'lobby')).toBe(false);
    expect(padUp(setPad(up(), true), true, 'lobby')).toBe(true);
    expect(padUp(up(), true, 'lobby')).toBe(false);
  });
});

describe('rows changed by someone else (keyboard flash)', () => {
  const changed = (rev: number) => {
    const s = snapshot({ rev });
    s.rows = s.rows.map((r) => (r.id === 'difficulty' ? { ...r, value: 'hard' } : r));
    return s;
  };
  it('a row whose content changed flashes for FLASH_MS; the first snapshot and unchanged rows do not', () => {
    expect(Object.keys(up().flash)).toEqual([]);
    const ui = onSnapshot(up(), changed(4), 1000);
    expect(flashing(ui, 'difficulty', 1000 + FLASH_MS - 1)).toBe(true);
    expect(flashing(ui, 'difficulty', 1000 + FLASH_MS)).toBe(false);
    expect(flashing(ui, 'events', 1000)).toBe(false);
  });
  it('the row this phone just touched is not flashed back at it, but one touched long ago is', () => {
    expect(flashing(onSnapshot(touched(up(), 'difficulty', 900), changed(4), 1000), 'difficulty', 1000)).toBe(false);
    expect(flashing(onSnapshot(touched(up(), 'difficulty', 0), changed(4), 5000), 'difficulty', 5000)).toBe(true);
  });
});

describe('"Aptos para N" and the first-use card', () => {
  it('the filter keeps only the cards the screen says fit; off lists them all', () => {
    const items = snapshot().rows.find((r) => r.kind === 'grid')!.groups![0]!.items;
    expect(visibleItems(up(), items)).toHaveLength(4);
    expect(visibleItems(toggleFit(up()), items).map((i) => i.id)).toEqual(['1', '2', '3']);
  });
  it('the card is a flag the phone raises and lowers', () => {
    expect(showIntro(up(), true).intro).toBe(true);
    expect(showIntro(showIntro(up(), true), false).intro).toBe(false);
  });
});
