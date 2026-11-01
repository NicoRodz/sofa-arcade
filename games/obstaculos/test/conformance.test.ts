import { describe, expect, it } from 'vitest';
import { checkGame } from '@pichi/core/testkit';
import { obstaculosController } from '../controller';
import { obstaculosManifest } from '../manifest';
import { obstaculosProtocol } from '../protocol';

describe('obstaculos conforms to the game contract', () => {
  it('manifest, wire protocol and phone agree (ids, modes, howTo, slots)', () => {
    expect(checkGame({ manifest: obstaculosManifest, protocol: obstaculosProtocol, controller: obstaculosController })).toEqual([]);
  });
});
