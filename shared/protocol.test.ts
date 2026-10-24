import { describe, expect, it } from 'vitest';
import { BUZZ_PATTERNS, ClockSync, applyDeadzone, canStart, newRoomCode, nextPhase, parseClientMessage } from './protocol';
import { assignPuestos } from './puestos';

describe('protocol', () => {
  it('rejects malformed messages and clamps input', () => {
    expect(parseClientMessage('nope')).toBeNull();
    expect(parseClientMessage('{"t":"input","seq":1}')).toBeNull();
    const m = parseClientMessage('{"t":"input","seq":1,"x":5,"y":-5,"btn":1,"presses":[70000],"ts":1}');
    expect(m).toMatchObject({ x: 1, y: -1, presses: [70000 % 65536] });
  });
  it('deadzone zeroes small vectors', () => {
    expect(applyDeadzone(0.1, 0.1)).toEqual([0, 0]);
    expect(applyDeadzone(1, 0)).toEqual([1, 0]);
  });
  it('clock sync picks the lowest-RTT sample', () => {
    const c = new ClockSync();
    c.add(100, 1000, 1550); // off = 500
    c.add(10, 2000, 2105); // off = 100
    expect(c.offset).toBe(100);
  });
  it('parses join: trims and caps the name, requires a token', () => {
    expect(parseClientMessage('{"t":"join","name":"  Ana  ","token":"x"}')).toEqual({ t: 'join', name: 'Ana', token: 'x' });
    expect(parseClientMessage(JSON.stringify({ t: 'join', name: 'a'.repeat(40), token: 'x' }))).toMatchObject({ name: 'a'.repeat(16) });
    expect(parseClientMessage('{"t":"join","name":"Ana","token":""}')).toBeNull();
    expect(parseClientMessage('{"t":"join","name":"Ana"}')).toBeNull();
  });
  it('parses phase messages and rejects unknown phases or bad scores', () => {
    expect(parseClientMessage('{"t":"phase","phase":"playing"}')).toEqual({ t: 'phase', phase: 'playing' });
    expect(parseClientMessage('{"t":"phase","phase":"results","scores":[{"id":1,"score":3,"x":9}]}')).toEqual({
      t: 'phase', phase: 'results', scores: [{ id: 1, score: 3 }],
    });
    expect(parseClientMessage('{"t":"phase","phase":"boom"}')).toBeNull();
    expect(parseClientMessage('{"t":"phase","phase":"results","scores":[{"id":1}]}')).toBeNull();
    expect(parseClientMessage('{"t":"phase","phase":"results","scores":"no"}')).toBeNull();
  });
  it('parses buzz (screen to one phone): needs a player and a known kind, and each pattern is a short on/off list', () => {
    expect(parseClientMessage('{"t":"buzz","playerId":3,"kind":"pick"}')).toEqual({ t: 'buzz', playerId: 3, kind: 'pick' });
    expect(parseClientMessage('{"t":"buzz","playerId":3,"kind":"earthquake"}')).toBeNull();
    expect(parseClientMessage('{"t":"buzz","kind":"pick"}')).toBeNull();
    expect(parseClientMessage('{"t":"buzz","playerId":3,"kind":"constructor"}')).toBeNull();
    expect(BUZZ_PATTERNS.pick).toEqual([20]);
    expect(BUZZ_PATTERNS.chop).toEqual([40]);
    for (const p of Object.values(BUZZ_PATTERNS)) expect(p.reduce((a, b) => a + b, 0)).toBeLessThan(200);
  });
  it('rejects unknown message types', () => {
    expect(parseClientMessage('{"t":"hack"}')).toBeNull();
    expect(parseClientMessage('null')).toBeNull();
  });
});

describe('phases', () => {
  it('the menu hands over to the lobby of the picked game and back, and nothing else leaves the menu', () => {
    expect(nextPhase('menu', 'pick')).toBe('lobby');
    expect(nextPhase('lobby', 'back')).toBe('menu');
    for (const ev of ['start', 'timeout', 'again', 'back'] as const) expect(nextPhase('menu', ev)).toBe('menu');
    for (const ph of ['playing', 'results'] as const) for (const ev of ['pick', 'back'] as const) expect(nextPhase(ph, ev)).toBe(ph);
    expect(nextPhase('lobby', 'pick')).toBe('lobby');
  });
  it('a phone message cannot invent a phase, and menu is a known one', () => {
    expect(parseClientMessage('{"t":"phase","phase":"menu"}')).toEqual({ t: 'phase', phase: 'menu' });
    expect(parseClientMessage('{"t":"phase","phase":"arena"}')).toBeNull();
  });
  it('walks lobby -> playing -> results -> lobby', () => {
    expect(nextPhase('lobby', 'start')).toBe('playing');
    expect(nextPhase('playing', 'timeout')).toBe('results');
    expect(nextPhase('results', 'again')).toBe('lobby');
  });
  it('ignores events that do not apply to the current phase', () => {
    expect(nextPhase('lobby', 'timeout')).toBe('lobby');
    expect(nextPhase('lobby', 'again')).toBe('lobby');
    expect(nextPhase('playing', 'start')).toBe('playing');
    expect(nextPhase('playing', 'again')).toBe('playing');
    expect(nextPhase('results', 'start')).toBe('results');
  });
  it('needs at least one connected player to start', () => {
    expect(canStart([])).toBe(false);
    expect(canStart([{ connected: false }])).toBe(false);
    expect(canStart([{ connected: false }, { connected: true }])).toBe(true);
  });
  it('room codes are 4 letters', () => {
    expect(newRoomCode()).toMatch(/^[A-Z]{4}$/);
    expect(newRoomCode(() => 0)).toBe('AAAA');
  });
});

describe('lobby config', () => {
  it('parses a known game and rejects unknown or missing ones', () => {
    expect(parseClientMessage('{"t":"config","game":"pizzas","difficulty":"hard","map":"3","seed":7}')).toEqual({ t: 'config', game: 'pizzas', difficulty: 'hard', map: '3', seed: 7 });
    expect(parseClientMessage('{"t":"config","game":"nope","difficulty":"hard","map":"3","seed":1}')).toBeNull();
    expect(parseClientMessage('{"t":"config","game":"pizzas","difficulty":"insane","map":"3","seed":1}')).toBeNull();
    expect(parseClientMessage('{"t":"config","game":"pizzas","difficulty":"hard","map":"99","seed":7}')).toBeNull();
    expect(parseClientMessage('{"t":"config","game":"pizzas","difficulty":"hard","map":"random","seed":4294967295}')).toMatchObject({ map: 'random', seed: 4294967295 });
    expect(parseClientMessage('{"t":"config","game":"pizzas","difficulty":"hard","map":"random","seed":4294967296}')).toBeNull();
    expect(parseClientMessage('{"t":"config","game":"pizzas","difficulty":"hard","map":"random","seed":-1}')).toBeNull();
    expect(parseClientMessage('{"t":"config","game":"pizzas","difficulty":"hard","map":"random","seed":1.5}')).toBeNull();
    expect(parseClientMessage('{"t":"config","game":"pizzas","difficulty":"hard"}')).toBeNull();
    expect(parseClientMessage('{"t":"config","game":"pizzas","difficulty":"hard","map":"3"}')).toBeNull();
    expect(parseClientMessage('{"t":"config"}')).toBeNull();
  });
});

describe('puestos on the wire', () => {
  const msg = { cheese: true, sink: false, assign: [{ id: 1, puestos: ['masa', 'horno'], pool: ['masa', 'corte', 'horno'] }] };
  it('a phase message may carry the round puestos; bad ids or shapes are rejected', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'phase', phase: 'playing', puestos: msg }))).toEqual({ t: 'phase', phase: 'playing', puestos: msg });
    expect(parseClientMessage(JSON.stringify({ t: 'phase', phase: 'playing', puestos: { ...msg, assign: [{ id: 1, puestos: ['hack'], pool: [] }] } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'phase', phase: 'playing', puestos: { ...msg, cheese: 'yes' } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'phase', phase: 'playing', puestos: 7 }))).toBeNull();
  });
  it('a real round message fits: every chef of an 8-player table with the full pool of puestos', () => {
    const f = { cheese: true, sink: true };
    const pm = assignPuestos([1, 2, 3, 4, 5, 6, 7, 8], f);
    expect(pm.assign[0]!.pool.length).toBeGreaterThanOrEqual(6);
    expect(parseClientMessage(JSON.stringify({ t: 'phase', phase: 'playing', puestos: pm }))).toEqual({ t: 'phase', phase: 'playing', puestos: pm });
    expect(parseClientMessage(JSON.stringify({ t: 'phase', phase: 'playing', puestos: assignPuestos([1, 2], f) }))).not.toBeNull();
  });
  it('"Cambiar" sends the new puesto list', () => {
    expect(parseClientMessage('{"t":"puesto","puestos":["corte"]}')).toEqual({ t: 'puesto', puestos: ['corte'] });
    expect(parseClientMessage('{"t":"puesto","puestos":[]}')).toBeNull();
    expect(parseClientMessage('{"t":"puesto","puestos":["boss"]}')).toBeNull();
    expect(parseClientMessage('{"t":"puesto"}')).toBeNull();
  });
});
