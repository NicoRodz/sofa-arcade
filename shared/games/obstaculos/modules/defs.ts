// The module catalog (plan §12). Every module is validated on its own (wrapped between two flat caps) by modules.test.ts,
// for every mode its tether allows, with the fewest players it declares and with 8.
import { Canvas, mod } from './dsl';
import type { LevelModule } from './types';

const G = 14; // standing row; the floor top is row 15

export const MODULES: readonly LevelModule[] = [
  mod({ id: 'wall3', name: 'Muro de 3', minPlayers: 2, tether: 'any', coop: false, c: new Canvas(10).rect(4, 12, 6, 14, '#') }),
  mod({ id: 'wall4', name: 'Muro de 4: torre de 2', minPlayers: 2, tether: 'any', coop: true, c: new Canvas(12).rect(4, 11, 8, 14, '#') }),
  mod({ id: 'wall5', name: 'Muro de 5: torre de 3', minPlayers: 3, tether: 'any', coop: true, c: new Canvas(14).rect(5, 10, 9, 14, '#') }),
  mod({ id: 'spikepit', name: 'Foso de pinchos', minPlayers: 2, tether: 'any', coop: false, c: new Canvas(12).pit(4, 7, '^', G + 1).rect(4, 16, 7, 17, '#') }),
  mod({ id: 'lavahop', name: 'Islotes sobre lava', minPlayers: 2, tether: 'any', coop: false, c: (() => { const c = new Canvas(18).pit(4, 13, '~'); c.rect(8, 15, 9, 15, '#'); return c; })() }),
  mod({ id: 'gauntlet', name: 'Pasillo de pinchos', minPlayers: 2, tether: 'any', coop: false, c: new Canvas(20).rect(5, G, 6, G, '^').rect(12, G, 13, G, '^') }),
  mod({ id: 'crumble', name: 'Pasarela que se rompe', minPlayers: 2, tether: 'any', coop: false, timing: true, c: new Canvas(14).pit(3, 10, '~').rect(3, 15, 10, 15, '!') }),
  mod({ id: 'boyas', name: 'Boyas', minPlayers: 2, tether: 'any', coop: false, timing: true, c: new Canvas(18).pit(4, 13, '~').set(7, 15, 'T').set(11, 15, 'T') }),
  mod({
    id: 'platepair', name: 'Placas a / b', minPlayers: 2, tether: 'any', coop: true,
    c: new Canvas(22).rect(10, 0, 10, 11, '#').rect(10, 12, 10, 14, 'A').rect(4, G, 6, G, 'a').rect(14, G, 16, G, 'b'),
    params: { a: { kind: 'plate', weight: 'half-up', opens: 'A', latch: false }, b: { kind: 'plate', weight: 'half-down', opens: 'A', latch: false }, A: { kind: 'gate' } },
  }),
  mod({
    id: 'latchgate', name: 'Palanca de una vez', minPlayers: 2, tether: 'any', coop: true,
    c: new Canvas(16).rect(10, 0, 10, 11, '#').rect(10, 12, 10, 14, 'A').rect(3, G, 5, G, 'a'),
    params: { a: { kind: 'plate', weight: 'half-up', opens: 'A', latch: true }, A: { kind: 'gate' } },
  }),
  mod({
    id: 'elevator', name: 'Montacargas', minPlayers: 2, tether: 'any', coop: true, timing: true,
    c: new Canvas(22).pit(5, 9, '^', G + 2).rect(5, 15, 7, 15, 'A').rect(8, 9, 12, 14, '#').rect(13, 15, 21, 15, '#').set(4, G, 'a').set(9, 8, 'b'),
    params: { a: { kind: 'lever', opens: 'A', latch: false }, b: { kind: 'lever', opens: 'A', latch: false }, A: { kind: 'mover', dx: 0, dy: -6, periodSec: 5 } },
  }),
  mod({
    id: 'cart', name: 'Vagoneta', minPlayers: 2, tether: 'any', coop: true, timing: true,
    c: new Canvas(24).pit(5, 17, '^', G + 2).rect(5, 15, 7, 15, 'A').set(3, G, 'a').set(19, G, 'b'),
    params: { a: { kind: 'lever', opens: 'A', latch: false }, b: { kind: 'lever', opens: 'A', latch: false }, A: { kind: 'mover', dx: 10, dy: 0, periodSec: 5 } },
  }),
  mod({
    id: 'ring', name: 'Argolla y piedras', minPlayers: 2, tether: 'any', coop: true,
    c: new Canvas(18).pit(4, 10, '~').set(4, 12, 'o').set(6, G, '%').set(9, G, '%'),
  }),
  mod({
    id: 'ladder', name: 'Escalera que aparece', minPlayers: 2, tether: 'any', coop: true,
    c: new Canvas(20).rect(8, 7, 9, 14, '#').rect(2, 12, 4, 14, '#').set(3, 11, 'a').rect(7, 7, 7, 14, 'F'),
    params: { a: { kind: 'plate', weight: 1, opens: 'F', latch: true }, F: { kind: 'ladder' } },
  }),
  mod({
    id: 'keydoor', name: 'Llave y puerta', minPlayers: 2, tether: 'any', coop: true,
    c: new Canvas(22).rect(3, 11, 7, 14, '#').set(5, 10, 'k').rect(14, 0, 14, 11, '#').rect(14, 12, 14, 14, 'K'),
  }),
  mod({ id: 'stairs', name: 'Escalera de saltos', minPlayers: 2, tether: 'any', coop: false, c: new Canvas(16).rect(3, 13, 5, 14, '#').rect(6, 12, 8, 14, '#').rect(9, 13, 11, 14, '#') }),
] as const;

export const moduleById = (id: string): LevelModule => {
  const m = MODULES.find((x) => x.id === id);
  if (!m) throw new Error(`no module ${id}`);
  return m;
};
