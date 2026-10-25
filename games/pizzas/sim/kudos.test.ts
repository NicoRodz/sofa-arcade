import { describe, expect, it } from 'vitest';
import { Emitter, type GameEvents } from '@pichi/core/events';
import { kudosLines, tallyKitchen } from './kudos';

const name = (id: number) => ({ 1: 'Ana', 2: 'Beto', 3: 'Caro' })[id as 1 | 2 | 3] ?? `J${id}`;

describe('kudos: who rescued pizzas and who put fires out', () => {
  it('counts oven:rescued and fire:out per chef; nothing counted says nothing', () => {
    const bus = new Emitter<GameEvents>();
    const t = tallyKitchen(bus);
    expect(kudosLines(t, name)).toEqual([]);
    bus.emit('oven:rescued', { player: 1, station: 4 });
    bus.emit('oven:rescued', { player: 1, station: 4 });
    bus.emit('oven:rescued', { player: 2, station: 5 });
    bus.emit('fire:out', { player: 3, station: 4 });
    expect(kudosLines(t, name)).toEqual(['Rescató pizzas del fuego: Ana (2)', 'Apagó incendios: Caro (1)']);
  });
  it('a tie lists everybody, in id order; reset clears the round; off stops listening', () => {
    const bus = new Emitter<GameEvents>();
    const t = tallyKitchen(bus);
    bus.emit('fire:out', { player: 2, station: 4 });
    bus.emit('fire:out', { player: 1, station: 4 });
    expect(kudosLines(t, name)).toEqual(['Apagó incendios: Ana y Beto (1)']);
    t.reset();
    expect(kudosLines(t, name)).toEqual([]);
    t.off();
    bus.emit('fire:out', { player: 1, station: 4 });
    expect(kudosLines(t, name)).toEqual([]);
  });
  it('the events of a versus round (they carry a team) count the same', () => {
    const bus = new Emitter<GameEvents>();
    const t = tallyKitchen(bus);
    bus.emit('oven:rescued', { player: 3, station: 4, team: 1 });
    expect(kudosLines(t, name)).toEqual(['Rescató pizzas del fuego: Caro (1)']);
  });
  it('the silly awards need a number worth a name, and the results show at most three lines', () => {
    const bus = new Emitter<GameEvents>();
    const t = tallyKitchen(bus);
    bus.emit('washDone', { player: 2, station: 1 });
    bus.emit('washDone', { player: 2, station: 1 });
    expect(kudosLines(t, name)).toEqual([]); // two plates are not a king
    bus.emit('washDone', { player: 2, station: 1 });
    expect(kudosLines(t, name)).toEqual(['Rey del lavaplatos: Beto (3)']);
    for (let i = 0; i < 6; i++) bus.emit('dash', { player: 1, dx: 1, dy: 0 });
    for (let i = 0; i < 2; i++) bus.emit('bump', { player: 3, other: 1 });
    for (let i = 0; i < 6; i++) bus.emit('chopDone', { player: 1, station: 2 });
    bus.emit('oven:rescued', { player: 1, station: 4 });
    expect(kudosLines(t, name)).toHaveLength(3);
    expect(kudosLines(t, name)[0]).toBe('Rescató pizzas del fuego: Ana (1)');
  });
});
