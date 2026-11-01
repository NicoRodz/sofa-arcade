// Pizzas on the phone (ControllerGame): the setup line, the station card, the versus verdict, the Ayudante switch and the Cocina escuela card.
import type { ControllerGame } from '@pichi/controller-kit/contract';
import { DIFFICULTY_LABEL } from '@pichi/core/difficulty';
import type { LobbyConfig } from '@pichi/core';
import { fixedMap } from '../sim/maps';
import type { PuestoMsgPz } from '../sim/puestos';
import { SABOTAGE_LABEL, sabotageOf } from '../sim/sabotage-config';
import { kvOf } from '../sim/school';
import { VERSUS_AUTO, VERSUS_RANDOM, versusMap } from '../sim/versus/maps';
import type { PhoneResult } from '../sim/versus/report';
import { createAssist } from './assist';
import { createPuestos } from './puestos';
import { createSchoolUi } from './school';
import { showVerdict } from './verdict';

/** "Versus · dificultad · mapa · Sabotaje" (the Versus parts only in versus). */
export function setupLabel(m: LobbyConfig): string {
  const versus = m.modeId === 'versus';
  const mapName =
    m.map === 'auto' || m.map === VERSUS_AUTO
      ? 'Mapa al azar'
      : m.map === 'random' || m.map === VERSUS_RANDOM
        ? `Mapa aleatorio ${m.seed}`
        : ((fixedMap(m.map) ?? versusMap(m.map))?.name ?? '');
  return `${versus ? 'Versus · ' : ''}${DIFFICULTY_LABEL[m.difficulty]} · ${mapName}${versus ? ` · Sabotaje ${SABOTAGE_LABEL[sabotageOf(m.modeOptions)]}` : ''}`;
}

export function createPizzasController(): ControllerGame {
  let assist: ReturnType<typeof createAssist> | undefined;
  let puestos: ReturnType<typeof createPuestos> | undefined;
  return {
    id: 'pizzas',
    setupLabel,
    init(host) {
      assist = createAssist(host);
      puestos = createPuestos(host);
    },
    onPhase(p, host) {
      puestos?.apply(p.phase === 'playing' ? (p.puestos as PuestoMsgPz | undefined) : undefined); // the wire's slots are opaque: this game knows its stations
      if (p.phase === 'results' && p.scores) showVerdict(p.result as PhoneResult | undefined, host.myTeam());
    },
    onMessage(m, host) {
      if (m.t === 'joined')
        assist?.show(false); // the relay tells a phone that comes back what it had chosen (after this message)
      else if (m.t === 'assist' && m.playerId === host.myId()) {
        assist?.show(m.on);
        return true;
      }
      return false;
    },
    school: (deps) =>
      createSchoolUi({
        ...deps,
        kv: (() => {
          try {
            return kvOf(localStorage);
          } catch {
            return null;
          }
        })(),
      }),
  };
}

export const pizzasController = createPizzasController();
