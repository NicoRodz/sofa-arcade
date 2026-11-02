import { describe, expect, it } from 'vitest';
import { GAMES } from '@pichi/catalog';
import type { GameManifest } from '@pichi/core/contract';
import { soonManifest } from '@pichi/core/testkit';
import { games, registerGames, type ScreenGame } from './game';

// Only the manifest matters to the registry; the hooks are exercised by the screen itself (they need Phaser and the DOM).
const first = GAMES[0];
const last = GAMES[GAMES.length - 1]!;
const stub = (manifest: GameManifest) => ({ manifest }) as unknown as ScreenGame;

describe('screen game registry (experimental contract)', () => {
  it('registers one ScreenGame per published manifest, in menu order', () => {
    registerGames(GAMES.map(stub));
    expect(games().ids()).toEqual(GAMES.map((g) => g.id)); // the explicit ids and order of the published list are asserted in core's contract.test
    expect(games().require(last.id).manifest).toBe(last);
  });
  it('refuses to start when a published manifest has no ScreenGame', () => {
    expect(() => registerGames(GAMES.slice(0, -1).map(stub))).toThrow(new RegExp(`missing ${last.id}`));
  });
  it('refuses a ScreenGame whose manifest is not published, and a duplicated one', () => {
    expect(() => registerGames([...GAMES.map(stub), stub(soonManifest)])).toThrow(/unknown soon-fixture/); // a `soon` game is not in the catalog
    expect(() => registerGames([stub(first), ...GAMES.map(stub)])).toThrow(new RegExp(`duplicated game id ${first.id}`));
  });
});
