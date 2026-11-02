import { describe, expect, it } from 'vitest';
import { checkGame } from '@pichi/core/testkit';
import { createCatalog } from '@pichi/core/contract';
import { GAMES } from '@pichi/catalog';
import { arenaController } from '../controller';
import { arenaManifest } from '../manifest';
import { arenaProtocol } from '../protocol';

describe('arena conforms to the game contract', () => {
  it('manifest, wire protocol and phone agree (ids, modes, howTo, slots)', () => {
    expect(checkGame({ manifest: arenaManifest, protocol: arenaProtocol, controller: arenaController })).toEqual([]);
  });
  it('is announced as soon, with the card the menu always showed', () => {
    // the name is the baseline's key (no testMoves for names): Manchazo is published now, so the check is that it carries no `soon` flag
    expect('soon' in arenaManifest).toBe(false);
    expect({ id: arenaManifest.id, name: arenaManifest.name, blurb: arenaManifest.blurb }).toEqual({
      id: 'arena',
      name: 'Manchazo',
      blurb: 'Dos equipos sueltan piñatas que pintan el piso en rombo: gana el que deje más piso de su color.',
    });
  });
  it('a catalog refuses a second manifest with the id of a published game', () => {
    expect(() => createCatalog([...GAMES, { ...arenaManifest, id: 'pizzas' }])).toThrow(/duplicated game id: pizzas/);
  });
});
