// A snapshot shaped like the Pizzas lobby's, for the menu's tests (state, markup, headless layout). Test support only: nothing in production imports it.
import type { MenuSnapshot } from '@pichi/core';

export const snapshot = (over: Partial<MenuSnapshot> = {}): MenuSnapshot => ({
  rev: 3,
  screen: 'lobby',
  rows: [
    {
      id: 'difficulty',
      label: 'Dificultad',
      kind: 'choice',
      value: 'normal',
      hint: 'Pedido cada 20 s, paciencia 60 s, hasta 4 pedidos',
      options: [
        { id: 'easy', label: 'Fácil', enabled: true },
        { id: 'normal', label: 'Normal', enabled: true },
        { id: 'hard', label: 'Difícil', enabled: true },
      ],
    },
    {
      id: 'mode',
      label: 'Modalidad',
      kind: 'choice',
      value: 'coop',
      hint: 'Cooperativo: todos cocinan juntos',
      options: [
        { id: 'coop', label: 'Cooperativo', enabled: true },
        { id: 'versus', label: 'Versus', enabled: false, reason: 'necesita 4 jugadores' },
      ],
    },
    { id: 'events', label: 'Eventos', kind: 'toggle', value: true },
    { id: 'mutate', label: 'Cocina que cambia', kind: 'toggle', value: false },
    {
      id: 'map',
      label: 'Mapa',
      kind: 'grid',
      value: '1',
      fitFor: 3,
      options: [
        { id: 'auto', label: 'Aleatorio', enabled: true },
        { id: 'random', label: 'Mapa generado', enabled: true },
      ],
      groups: [
        {
          id: 'classic',
          label: 'Clásicos',
          items: [
            { id: '1', label: 'Cocina Grande', players: '2-4', stars: 2, enabled: true },
            { id: '2', label: 'Food truck con nombre muy largo', players: '3-6', stars: 3, enabled: true },
            { id: '3', label: 'Sótano', players: '2-4', stars: 1, enabled: true },
            { id: '4', label: 'Banquete', players: '6-8', stars: 3, enabled: false, reason: 'necesita 6+ jugadores' },
          ],
        },
        { id: 'series', label: 'Carta larga', items: [{ id: '20', label: 'El río', players: '2-4', stars: 2, enabled: true }] },
      ],
    },
  ],
  primary: { id: 'start', label: '¡A cocinar!', enabled: true, summary: ['Mapa: Cocina Grande', 'Cooperativo · Normal', '3 jugadores'] },
  ...over,
});
