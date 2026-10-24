import { describe, expect, it } from 'vitest';
import { BUZZ_PATTERNS, ClockSync, DEFAULT_CONFIG, PROTOCOL_VERSION, applyDeadzone, canStart, configMsg, newRoomCode, nextPhase, parseClientMessage, parseTeams, youMsg } from './protocol';
import { GAMES } from './games';
import { assignPuestos } from './puestos';

describe('protocol', () => {
  it('rejects malformed messages and clamps input', () => {
    expect(parseClientMessage('nope')).toBeNull();
    expect(parseClientMessage('{"t":"input","seq":1}')).toBeNull();
    const m = parseClientMessage('{"t":"input","seq":1,"x":5,"y":-5,"btn":1,"presses":[70000],"ts":1}');
    expect(m).toMatchObject({ x: 1, y: -1, presses: [70000 % 65536] });
  });
  it('input carries the campaign signals: a counter and a state, both optional, a bad one is dropped and the input survives', () => {
    const base = { t: 'input', seq: 1, x: 0, y: 0, btn: 0, presses: [0, 0], ts: 5 };
    const plain = parseClientMessage(JSON.stringify(base));
    expect(plain).not.toHaveProperty('sig');
    expect(plain).not.toHaveProperty('go');
    const sig = parseClientMessage(JSON.stringify({ ...base, sig: { kind: 'arrowL', seq: 65537 }, go: true }));
    expect(sig).toMatchObject({ t: 'input', sig: { kind: 'arrowL', seq: 1 }, go: true });
    for (const bad of [{ kind: 'nope', seq: 1 }, { kind: 'go', seq: 1.5 }, { kind: 'go' }, 'go', 7]) {
      const m = parseClientMessage(JSON.stringify({ ...base, sig: bad, go: 'yes' }));
      expect(m).toMatchObject({ t: 'input', seq: 1 });
      expect(m).not.toHaveProperty('sig');
      expect(m).not.toHaveProperty('go');
    }
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
  it('the slip buzz is a single 120 ms pulse (sabotage); the hint message carries two labels of at most 14 characters, or null', () => {
    expect(BUZZ_PATTERNS.slip).toEqual([120]);
    expect(parseClientMessage('{"t":"buzz","playerId":3,"kind":"slip"}')).toEqual({ t: 'buzz', playerId: 3, kind: 'slip' });
    expect(parseClientMessage('{"t":"hint","playerId":3,"a":"Tomar bolsa","b":"¡Lanzar!"}')).toEqual({ t: 'hint', playerId: 3, a: 'Tomar bolsa', b: '¡Lanzar!' });
    expect(parseClientMessage('{"t":"hint","playerId":3,"a":null}')).toEqual({ t: 'hint', playerId: 3, a: null, b: null });
    expect(parseClientMessage('{"t":"hint","playerId":3,"a":"un rótulo demasiado largo"}')).toBeNull();
    expect(parseClientMessage('{"t":"hint","playerId":3,"a":"  "}')).toBeNull();
    expect(parseClientMessage('{"t":"hint","a":"A"}')).toBeNull();
    expect(parseClientMessage('{"t":"hint","playerId":3,"a":7}')).toBeNull();
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
    expect(parseClientMessage('{"t":"config","game":"pizzas","difficulty":"hard","map":"3","seed":7}')).toEqual({ t: 'config', game: 'pizzas', difficulty: 'hard', map: '3', seed: 7, modeId: 'coop', teams: null, teamsLocked: false, modeOptions: {} }); // v1 screen: no team fields, so cooperative
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

describe('teams on the wire (protocol v2)', () => {
  const base = { t: 'config', game: 'pizzas', difficulty: 'normal', map: 'auto', seed: 5 };
  const teams = [
    { id: 0, name: 'Picantes', color: '#F26A1B', icon: '▲', side: 'izquierda', playerIds: [1, 3] },
    { id: 1, name: 'Frescos', color: '#1E6BD6', icon: '●', playerIds: [2, 4] },
  ];
  const parse = (extra: object) => parseClientMessage(JSON.stringify({ ...base, ...extra }));

  it('the version was bumped', () => { expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(2); });
  it('a config with a declared mode, teams, the lock and the options round-trips', () => {
    const m = parse({ modeId: 'versus', teams, teamsLocked: true, modeOptions: { hiddenScore: true, rounds: 3, tag: 'x' } });
    expect(m).toEqual({ ...base, modeId: 'versus', teams, teamsLocked: true, modeOptions: { hiddenScore: true, rounds: 3, tag: 'x' } });
  });
  it('rejects a mode the game does not declare, an unknown mode, and malformed team data', () => {
    expect(parse({ modeId: 'ffa' })).toBeNull(); // a real mode id, but pizzas does not play it
    expect(parse({ modeId: 'nope' })).toBeNull();
    expect(parse({ teamsLocked: 'yes' })).toBeNull();
    expect(parse({ modeOptions: { a: { b: 1 } } })).toBeNull();
    expect(parse({ modeOptions: [1] })).toBeNull();
    expect(parse({ teams: 'x' })).toBeNull();
    expect(parse({ teams: [] })).toBeNull();
    expect(parse({ teams: [{ ...teams[0], color: 'orange' }] })).toBeNull();
    expect(parse({ teams: [{ ...teams[0], id: 7 }] })).toBeNull();
    expect(parse({ teams: [teams[0], { ...teams[1], id: 0 }] })).toBeNull(); // duplicated team id
    expect(parse({ teams: [teams[0], { ...teams[1], playerIds: [3] }] })).toBeNull(); // a player in two teams
    expect(parse({ teams: Array.from({ length: 5 }, (_v, i) => ({ ...teams[0], id: i, playerIds: [i] })) })).toBeNull();
    expect(parseTeams(undefined)).toBeNull();
  });
  it('"Cambiar de equipo" is a phone message with a valid team id', () => {
    expect(parseClientMessage('{"t":"setTeam","teamId":1}')).toEqual({ t: 'setTeam', teamId: 1 });
    expect(parseClientMessage('{"t":"setTeam","teamId":9}')).toBeNull();
    expect(parseClientMessage('{"t":"setTeam","teamId":"a"}')).toBeNull();
    expect(parseClientMessage('{"t":"setTeam"}')).toBeNull();
  });
  it('a phase message may carry the match start; an incomplete or foreign one is rejected', () => {
    const match = { gameId: 'pizzas', modeId: 'versus', mapId: '8', difficulty: 'hard', teams, modeOptions: { hiddenScore: false } };
    expect(parseClientMessage(JSON.stringify({ t: 'phase', phase: 'playing', match }))).toEqual({ t: 'phase', phase: 'playing', match });
    expect(parseClientMessage(JSON.stringify({ t: 'phase', phase: 'playing', match: { ...match, teams: null } }))).toMatchObject({ match: { teams: null } });
    expect(parseClientMessage(JSON.stringify({ t: 'phase', phase: 'playing', match: { ...match, gameId: 'nope' } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'phase', phase: 'playing', match: { ...match, modeId: 'nope' } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'phase', phase: 'playing', match: { ...match, mapId: undefined } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'phase', phase: 'playing', match: 3 }))).toBeNull();
  });
  it('the phones get the labels of the chosen mode: versus brings its own how-to, coop keeps the game one', () => {
    const coop = configMsg({ ...DEFAULT_CONFIG, modeId: 'coop' });
    const versus = configMsg({ ...DEFAULT_CONFIG, modeId: 'versus' });
    expect(coop.howTo).toBe(GAMES[0].howTo);
    expect(versus.howTo).not.toBe(GAMES[0].howTo);
    expect(versus.howTo.steps.length).toBeGreaterThanOrEqual(3);
    expect(versus.controls).toEqual(GAMES[0].controls);
    expect(versus).toMatchObject({ modeId: 'versus', teams: null, teamsLocked: false });
  });
  it('youMsg tells a phone its team (and nothing when it has none)', () => {
    expect(youMsg(teams, 3)).toEqual({ t: 'you', teamId: 0, color: '#F26A1B', icon: '▲', sideLabel: 'izquierda' });
    expect(youMsg(teams, 2)).toEqual({ t: 'you', teamId: 1, color: '#1E6BD6', icon: '●' });
    expect(youMsg(teams, 99)).toBeNull();
    expect(youMsg(null, 1)).toBeNull();
  });
});

describe("the Captain's 'nav' on the wire (protocol v3)", () => {
  it('the version was bumped for the crown', () => { expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(3); });
  it('every D-pad key parses to a nav with only the key in it', () => {
    for (const key of ['up', 'down', 'left', 'right', 'ok', 'back', 'help']) expect(parseClientMessage(JSON.stringify({ t: 'nav', key }))).toEqual({ t: 'nav', key });
  });
  it('drops a `from`, a playerId or any extra field a phone puts in the payload: who sent it is the relay\'s call', () => {
    expect(parseClientMessage('{"t":"nav","key":"ok","from":1,"playerId":1,"captain":true}')).toEqual({ t: 'nav', key: 'ok' });
  });
  it('refuses an unknown or missing key and anything that is not a string', () => {
    for (const bad of ['{"t":"nav"}', '{"t":"nav","key":"start"}', '{"t":"nav","key":"Enter"}', '{"t":"nav","key":1}', '{"t":"nav","key":null}', '{"t":"nav","key":["ok"]}', '{"t":"nav","key":"__proto__"}']) expect(parseClientMessage(bad), bad).toBeNull();
  });
});

describe('the versus result on the wire (protocol v4)', () => {
  const res = { verdict: 'win', winner: 0, scores: [{ team: 0, score: 410 }, { team: 1, score: 340 }] };
  const phase = (result: unknown) => parseClientMessage(JSON.stringify({ t: 'phase', phase: 'results', scores: [{ id: 1, score: 410 }], result }));

  it('the version was bumped for the result', () => { expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(4); });
  it('a results phase carries the verdict, the winner and every team\'s score', () => {
    expect(phase(res)).toEqual({ t: 'phase', phase: 'results', scores: [{ id: 1, score: 410 }], result: res });
    for (const [verdict, winner] of [['draw', null], ['nowinner', null], ['aborted', null], ['win', 1]] as const) expect(phase({ ...res, verdict, winner })).toMatchObject({ result: { verdict, winner } });
  });
  it('a coop results phase (no result) is the same as ever', () => {
    expect(parseClientMessage('{"t":"phase","phase":"results","scores":[{"id":1,"score":5}]}')).toEqual({ t: 'phase', phase: 'results', scores: [{ id: 1, score: 5 }] });
  });
  it('refuses a verdict it does not know, a win without a winner, a winner without a win, and bad scores', () => {
    expect(phase({ ...res, verdict: 'tie' })).toBeNull();
    expect(phase({ ...res, winner: null })).toBeNull(); // a win names its team
    expect(phase({ ...res, verdict: 'draw', winner: 0 })).toBeNull(); // a draw names nobody
    expect(phase({ ...res, winner: 9 })).toBeNull();
    expect(phase({ ...res, scores: [] })).toBeNull();
    expect(phase({ ...res, scores: [{ team: 0, score: 'x' }] })).toBeNull();
    expect(phase({ ...res, scores: [{ team: 7, score: 1 }] })).toBeNull();
    expect(phase({ ...res, scores: Array.from({ length: 5 }, (_v, i) => ({ team: i % 4, score: i })) })).toBeNull();
    expect(phase(null)).toBeNull();
    expect(phase('win')).toBeNull();
  });
  it('drops anything else a screen puts in the result', () => {
    expect(phase({ ...res, extra: 1, scores: [{ team: 0, score: 1, name: 'x' }] })).toMatchObject({ result: { verdict: 'win', winner: 0, scores: [{ team: 0, score: 1 }] } });
    expect(JSON.stringify(phase({ ...res, extra: 1 }))).not.toContain('extra');
  });
});
