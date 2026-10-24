import { describe, expect, it } from 'vitest';
import { Emitter, type GameEvents } from './events';
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
});
