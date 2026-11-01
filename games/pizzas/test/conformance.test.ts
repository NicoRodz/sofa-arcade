import { describe, expect, it } from 'vitest';
import { checkGame } from '@pichi/core/testkit';
import { pizzasController } from '../controller';
import { pizzasManifest } from '../manifest';
import { pizzasProtocol } from '../protocol';

describe('pizzas conforms to the game contract', () => {
  it('manifest, wire protocol and phone agree (ids, modes, howTo, slots)', () => {
    expect(checkGame({ manifest: pizzasManifest, protocol: pizzasProtocol, controller: pizzasController })).toEqual([]);
  });
});
