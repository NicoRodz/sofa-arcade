import { describe, expect, it } from 'vitest';
import type { GameManifest, GameProtocol } from '../contract';
import { checkGame } from './conformance';

const manifest: GameManifest = {
  id: 'fake',
  name: 'Fake',
  blurb: 'A fake game for the contract tests.',
  minPlayers: 2,
  maxPlayers: 4,
  controls: {
    stick: { label: 'Mover', icon: 'move' },
    btn1: { label: 'Saltar', icon: 'jump' },
    btn2: { label: 'Agarrar', icon: 'grab' },
  },
  howTo: {
    steps: [
      { icon: 'move', text: 'Muévete con el stick' },
      { icon: 'jump', text: 'Salta con A' },
      { icon: 'grab', text: 'Agarra con B' },
    ],
  },
};
const protocol: GameProtocol = { game: 'fake', defaultMap: 'a', isMap: (v) => v === 'a', signalKinds: ['go'], puestoCount: 2 };
const parts = { manifest, protocol, controller: { id: 'fake' } };

describe('checkGame', () => {
  it('a well-formed game has no problems', () => {
    expect(checkGame(parts)).toEqual([]);
    expect(checkGame({ manifest, protocol })).toEqual([]); // the controller is optional
  });
  it('the three halves must share one id', () => {
    expect(checkGame({ ...parts, controller: { id: 'other' } })).toEqual(['controller id "other" differs from manifest id "fake"']);
    expect(checkGame({ ...parts, protocol: { ...protocol, game: 'other' } })).toEqual([
      'protocol game "other" differs from manifest id "fake"',
    ]);
    expect(
      checkGame({
        ...parts,
        manifest: { ...manifest, id: 'Fake_1' },
        controller: { id: 'Fake_1' },
        protocol: { ...protocol, game: 'Fake_1' },
      }),
    ).toEqual(['manifest id "Fake_1" is not kebab-case']);
  });
  it('howTo may not be empty and the player range must be ordered', () => {
    expect(checkGame({ ...parts, manifest: { ...manifest, howTo: { steps: [] } } })).toContain('howTo has no steps');
    expect(checkGame({ ...parts, manifest: { ...manifest, minPlayers: 5 } })).toContain('minPlayers 5 is over maxPlayers 4');
  });
  it('modes are validated like the authoring check does', () => {
    const modes = [{ id: 'coop', label: 'Cooperativo', players: [2, 9] as [number, number] }];
    expect(checkGame({ ...parts, manifest: { ...manifest, modes } }).some((p) => p.startsWith('mode coop: players'))).toBe(true);
  });
  it('the protocol slots must be coherent', () => {
    expect(checkGame({ ...parts, protocol: { ...protocol, defaultMap: 'zz' } })).toEqual([
      'protocol defaultMap "zz" is not accepted by its own isMap',
    ]);
    expect(checkGame({ ...parts, protocol: { ...protocol, signalKinds: ['go', 'go'] } })).toEqual([
      'protocol signalKinds has a duplicated kind',
    ]);
    expect(checkGame({ ...parts, protocol: { ...protocol, puestoCount: -1 } })).toEqual(['protocol puestoCount -1 is not a count']);
  });
});
