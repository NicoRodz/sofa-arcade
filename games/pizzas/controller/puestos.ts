// The suggested station card of a Pizzas round: informs, never blocks. "Cambiar" cycles to another puesto and tells the screen.
import type { ControllerHost } from '@pichi/controller-kit';
import { iconSvg } from '@pichi/core';
import { PUESTOS, type PuestoId, type PuestoMsgPz } from '../sim/phone/puestos';

export function createPuestos(host: ControllerHost) {
  const card = (id: string) => host.slot.querySelector(`#${id}`) as HTMLElement;
  let pool: PuestoId[] = [];
  let now: PuestoId[] = [];
  let feats = { cheese: false, sink: false };
  function show(ids: PuestoId[] | null) {
    host.slot.ownerDocument.body.dataset.puesto = ids ? 'on' : 'off';
    if (!ids) return;
    now = ids;
    card('pico').innerHTML = iconSvg(PUESTOS[ids[0]!].icon);
    card('pname').textContent = ids.map((i) => PUESTOS[i].name).join(' + ');
    card('phint').textContent = ids.map((i) => PUESTOS[i].hint(feats)).join(' · ');
  }
  card('pswap').addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (!pool.length) return;
    const next = pool[(pool.indexOf(now[0]!) + 1) % pool.length]!;
    show([next]);
    host.send({ t: 'puesto', puestos: [next] });
  });
  return {
    /** The stations the screen dealt to this phone (undefined: none, the card hides). */
    apply(pm: PuestoMsgPz | undefined) {
      const mine = pm?.assign.find((a) => a.id === host.myId());
      if (!pm || !mine) {
        show(null);
        return;
      }
      feats = { cheese: pm.cheese, sink: pm.sink };
      pool = mine.pool;
      show(mine.puestos);
    },
  };
}
