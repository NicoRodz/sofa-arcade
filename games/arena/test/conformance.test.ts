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
    expect(arenaManifest.soon).toBe(true);
    expect({ id: arenaManifest.id, name: arenaManifest.name, blurb: arenaManifest.blurb }).toEqual({
      id: 'arena',
      name: 'Arena de empujones',
      blurb: 'Empuja a tus rivales fuera de la plataforma.',
    });
  });
  it('a catalog refuses a second manifest with the id of a published game', () => {
    expect(() => createCatalog([...GAMES, { ...arenaManifest, id: 'pizzas' }])).toThrow(/duplicated game id: pizzas/);
  });
});
