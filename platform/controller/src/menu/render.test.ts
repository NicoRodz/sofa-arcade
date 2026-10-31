import { describe, expect, it } from 'vitest';
import { snapshot } from './fixture';
import { menuHtml } from './render';
import { ask, initialUi, onSnapshot, openMaps, refuse, setTab, showIntro, toggleFit } from './state';

const ui = () => onSnapshot(initialUi(), snapshot(), 0);
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('the list (S1)', () => {
  const html = menuHtml(ui(), 0);
  it('draws a row per snapshot row, with the picked option marked and the hint of the row', () => {
    expect(count(html, /class="cm-row"/g)).toBe(5);
    expect(html).toMatch(/data-row="difficulty" data-val="normal"[^>]*aria-pressed="true"/);
    expect(html).toContain('Pedido cada 20 s');
  });
  it('disabled options keep their reason, a lock and no round trip (data-en=0 with the reason on it)', () => {
    expect(html).toMatch(/class="cm-opt off"[^>]*data-row="mode" data-val="versus" data-en="0" data-why="necesita 4 jugadores"/);
    expect(html).toContain('Versus: necesita 4 jugadores');
  });
  it('toggles are two segments, Sí / No, with the value as a boolean flag', () => {
    expect(html).toMatch(/data-row="events" data-val="1"[^>]*aria-pressed="true" data-bool="1"/);
    expect(html).toMatch(/data-row="events" data-val="0"[^>]*data-bool="1"/);
    expect(html).toMatch(/data-row="mutate" data-val="0"[^>]*aria-pressed="true" data-bool="1"/);
  });
  it('the map is a picked card plus "Cambiar mapa", and the foot has the start button with the snapshot label', () => {
    expect(html).toContain('<b>Cocina Grande</b>');
    expect(count(html, /data-cm="maps"/g)).toBe(2); // the row's and the landscape column's
    expect(html).toContain('data-cm="go"');
    expect(html).toContain('¡A COCINAR!');
  });
  it('start off: dimmed, with the reason under it', () => {
    const off = onSnapshot(
      initialUi(),
      snapshot({ primary: { id: 'start', label: '¡A cocinar!', enabled: false, reason: 'Esperando jugadores', summary: [] } }),
      0,
    );
    const h = menuHtml(off, 0);
    expect(h).toMatch(/class="cm-go off"/);
    expect(h).toContain('Esperando jugadores');
  });
  it('escapes everything the screen sent (a label is text, never markup)', () => {
    const s = snapshot();
    s.rows[0]!.label = '<img src=x onerror=1>';
    expect(menuHtml(onSnapshot(initialUi(), s, 0), 0)).not.toContain('<img');
  });
  it('shows the notice while it lasts', () => {
    expect(menuHtml(refuse(ui(), 'Cambió la configuración', 0), 1)).toMatch(/cm-notice on[^>]*>Cambió la configuración/);
    expect(menuHtml(refuse(ui(), 'Cambió la configuración', 0), 4000)).not.toMatch(/cm-notice on/);
  });
});

describe('the map picker (S2)', () => {
  it('tabs for the groups, the cards of the open one, locked ones with their reason, extras below', () => {
    const html = menuHtml(openMaps(ui()), 0);
    expect(count(html, /data-cm="tab"/g)).toBe(5);
    expect(html).toContain('>Recomendados para 3<');
    expect(html).toContain('>Sin dinámica<');
    expect(count(html, /class="cm-card/g)).toBe(4);
    expect(html).toMatch(/cm-card off[^>]*data-val="4" data-en="0" data-why="necesita 6\+ jugadores"/);
    expect(html).toMatch(/data-row="map" data-val="auto"/);
    expect(html).toContain('>Listo<');
  });
  it('the Sin dinámica tab lists the plain maps and nothing else', () => {
    const html = menuHtml(setTab(openMaps(ui()), 'plain'), 0);
    expect(count(html, /class="cm-card/g)).toBe(1);
    expect(html).toContain('Cocina Grande');
    expect(html).toMatch(/data-cm="tab" data-val="plain"[^>]*aria-selected="true"/);
  });
  it('the other tab shows the other cards', () => {
    const html = menuHtml(setTab(openMaps(ui()), 'series'), 0);
    expect(html).toContain('El río');
    expect(html).not.toContain('data-val="3"'); // the classic cards are not on this tab
  });
});

describe('the confirmation (S3)', () => {
  it('"Sí" starts disabled, wakes after 500 ms, the summary is there and the foot says Volver', () => {
    const c = ask(ui(), 1000);
    expect(menuHtml(c, 1100)).toMatch(/class="cm-yes" data-cm="yes" disabled/);
    expect(menuHtml(c, 1500)).not.toMatch(/class="cm-yes" data-cm="yes" disabled/);
    const h = menuHtml(c, 1500);
    expect(h).toContain('3 jugadores');
    expect(h).toMatch(/data-cm="back"[^>]*>Volver</);
    expect(h).not.toContain('data-cm="go"');
  });
});

describe('tanda 2: filter, flash and the first-use card', () => {
  it('the maps view offers "Aptos para N jugadores" and, once on, hides the locked card', () => {
    const maps = openMaps(ui());
    expect(menuHtml(maps, 0)).toContain('Aptos para 3 jugadores');
    expect(menuHtml(maps, 0)).toContain('Banquete');
    const on = menuHtml(toggleFit(maps), 0);
    expect(on).toMatch(/data-cm="fit"[^>]*aria-pressed="true"/);
    expect(on).not.toContain('Banquete');
  });
  it('a flashing row carries the class', () => {
    const s = snapshot({ rev: 4 });
    s.rows = s.rows.map((r) => (r.id === 'difficulty' ? { ...r, value: 'hard' } : r));
    const html = menuHtml(onSnapshot(ui(), s, 100), 100);
    expect(html).toMatch(/class="cm-row flash" data-kind="choice" data-row="difficulty"/);
  });
  it('the first-use card replaces the list and the foot, and has the "Entendido" button', () => {
    const html = menuHtml(showIntro(ui(), true), 0);
    expect(html).toContain('¡Eres el Capitán!');
    expect(html).toContain('data-cm="intro"');
    expect(html).not.toContain('cm-foot');
    expect(html).not.toContain('data-row="difficulty"');
  });
});
