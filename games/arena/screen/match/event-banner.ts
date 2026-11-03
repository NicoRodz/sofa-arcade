// What the TV says about the events (F4), as plain data: the announcement banner (text, subtitle, how long ago) and the "next event" line of the bottom band.
// No Phaser: the scene draws it, `event-banner.test.ts` reads it.
import {
  BANNER_TICKS,
  BALLOON_WARN_TICKS,
  BIG_WARN_TICKS,
  CLOCK_WARN_TICKS,
  CONTAGION_WARN_TICKS,
  FINAL_TICKS,
  HIDDEN_TICKS,
  MOVE_WARN_TICKS,
  type AnnounceKind,
  type EventKind,
  type ManchazoState,
} from '../../sim';

export interface Banner {
  kind: AnnounceKind;
  title: string;
  sub: string;
  team: number; // -1: no team colour
  age: number; // ticks since the announcement
}

export const EVENT_NAMES: Record<EventKind, string> = {
  bigPinata: 'Gran piñata',
  rain: 'Lluvia',
  gold: 'Casillas doradas',
  vacuum: 'Robot aspiradora',
  blackout: 'Apagón',
  contagion: 'Contagio',
  happyHour: 'Hora feliz',
  move: 'Mudanza',
  balloons: 'Globos en disputa',
};

const secs = (ticks: number) => Math.round(ticks / 60);

export function bannerText(kind: AnnounceKind, team: string): { title: string; sub: string } {
  switch (kind) {
    case 'bigPinata':
      return { title: '¡GRAN PIÑATA!', sub: `Cae al centro en ${secs(BIG_WARN_TICKS)} s: pisa la casilla y explota para tu equipo` };
    case 'rain':
      return { title: 'LLUVIA', sub: 'Una franja se despinta poco a poco: repíntala' };
    case 'gold':
      return { title: 'CASILLAS DORADAS', sub: 'La zona dorada vale x2 durante 15 s' };
    case 'vacuum':
      return { title: 'ROBOT ASPIRADORA', sub: 'Despinta lo que pisa: desvíalo con una explosión' };
    case 'blackout':
      return { title: 'APAGÓN', sub: 'Solo ves un círculo de luz a tu alrededor durante 6 s' };
    case 'contagion':
      return { title: 'CONTAGIO', sub: `En ${secs(CONTAGION_WARN_TICKS)} s se pasa al rival lo que tenga 3 vecinas suyas: junta tu color` };
    case 'happyHour':
      return { title: '¡HORA FELIZ!', sub: 'Piñatas con +1 de alcance y sin límite durante 8 s' };
    case 'move':
      return { title: 'MUDANZA', sub: `Dos pares de muebles saltan en ${secs(MOVE_WARN_TICKS)} s: ojo con los marcados` };
    case 'balloons':
      return { title: 'GLOBOS EN DISPUTA', sub: `Caen en ${secs(BALLOON_WARN_TICKS)} s: gana el equipo con más gente alrededor` };
    case 'comeback':
      return { title: '¡REMONTADA!', sub: `Piñatas más grandes para ${team}` };
    case 'hidden':
      return { title: 'MARCADOR OCULTO', sub: `Los últimos ${secs(HIDDEN_TICKS)} s se juegan a ciegas` };
    case 'clockWarn':
      return { title: 'RELOJ DE ARENA', sub: `Cae en ${secs(CLOCK_WARN_TICKS)} s: ${team} lo carga pintando el círculo y defendiéndolo` };
    case 'overtime':
      return { title: '¡TIEMPO EXTRA!', sub: `+15 s para todos (lo cargó ${team})` };
    case 'clockBroken':
      return { title: 'EL RELOJ SE ROMPIÓ', sub: 'Nadie lo llenó a tiempo' };
    case 'warnScramble':
      return { title: 'REVUELTA EN 2 s', sub: 'Más sabotajes y los eventos grandes: prepárate' };
    case 'phaseScramble':
      return { title: '¡REVUELTA!', sub: '2 pares de sabotajes y vuelven más rápido; entran los eventos grandes' };
    case 'warnFinal':
      return { title: 'FINAL EN 2 s', sub: 'Las piñatas van a crecer: cuida tu terreno' };
    case 'phaseFinal':
      return { title: '¡FINAL!', sub: `Últimos ${secs(FINAL_TICKS)} s: piñatas con +1 de radio y el mapa se acelera` };
  }
}

/** The announcement to show now: the latest one younger than BANNER_TICKS. */
export function bannerOf(s: ManchazoState, teamName: (team: number) => string): Banner | null {
  const last = s.match.ev?.log.at(-1);
  if (!last) return null;
  const age = s.grid.tick - last.tick;
  if (age < 0 || age >= BANNER_TICKS) return null;
  return { kind: last.kind, ...bannerText(last.kind, last.team >= 0 ? teamName(last.team) : ''), team: last.team, age };
}

/** "Próximo evento: Lluvia (en 12 s)" for the bottom band; empty when the program is over. */
export function nextLine(s: ManchazoState): string {
  const ev = s.match.ev;
  const p = ev?.program[ev.next];
  if (!ev || !p || ev.active) return '';
  return `Próximo evento: ${EVENT_NAMES[p.kind]} (${secs(Math.max(0, p.at - s.grid.tick))} s)`;
}
