// The phone's side of the Cocina escuela: a card with the instruction of the step (<= 8 words), four dots for the progress, the button the step uses pulsing,
// "Ya sé · saltar" for this player and, on the Captain's phone, "Saltar a todos" (the same 'ok' the D-pad sends: Enter on the TV). The phone remembers that its player
// finished (localStorage, by token) and says so on every join, so the next room does not repeat the school for it.
import type { ClientMsg, ServerMsg } from '@party/shared';
import { SCHOOL_TOTAL, markDone, phoneKey, readDone, type KV } from '@party/shared/tutorial';

type SchoolServerMsg = Extract<ServerMsg, { t: 'school' }>;
export interface SchoolUi {
  apply(m: SchoolServerMsg): void;
  show(on: boolean): void;
  announce(): void;
  refreshCaptain(): void;
}

export function createSchoolUi(o: {
  doc?: Document;
  kv: KV | null;
  token: string;
  send: (m: ClientMsg) => void;
  isCaptain: () => boolean;
}): SchoolUi {
  const doc = o.doc ?? document;
  const $ = (id: string) => doc.getElementById(id) as HTMLElement;
  const key = phoneKey(o.token);
  let remembered = readDone(o.kv, key);
  let done = false;
  const dots = $('schooldots');
  dots.innerHTML = '<i></i>'.repeat(SCHOOL_TOTAL);
  const press = (id: string, fn: () => void) =>
    $(id).addEventListener('pointerup', (e) => {
      e.preventDefault();
      fn();
    });
  const remember = () => {
    if (remembered) return;
    remembered = true;
    markDone(o.kv, key);
    o.send({ t: 'schoolDone' });
  };
  press('schoolskip', () => {
    if (done) return;
    remembered = true;
    markDone(o.kv, key);
    o.send({ t: 'schoolDone', skip: true });
  }); // "Ya sé": this chef is done at once, and next time the phone says so
  press('schoolall', () => {
    if (o.isCaptain()) o.send({ t: 'nav', key: 'ok' });
  });
  const light = (btn: 'a' | 'b' | undefined) => {
    for (const [b, id] of [
      ['a', 'A'],
      ['b', 'B'],
    ] as const)
      for (const el of [$(`btn${id}`), $(`lbl${id}`)]) el.classList.toggle('hl', btn === b);
  };
  return {
    apply(m) {
      if (doc.body.dataset.school !== 'on') return; // a late message after the school ended
      done = m.done === true;
      $('schoolstep').textContent = done ? '¡Listo!' : `Paso ${m.step + 1} de ${m.total}`;
      $('schooltext').textContent = m.text;
      Array.from(dots.children).forEach((d, i) => d.classList.toggle('on', i < m.step));
      $('school').classList.toggle('done', done);
      ($('schoolskip') as HTMLButtonElement).disabled = done;
      light(m.btn);
      if (done) remember(); // finished (or skipped, or already known): the phone keeps it
    },
    show(on) {
      doc.body.dataset.school = on ? 'on' : 'off';
      if (!on) light(undefined);
      else this.refreshCaptain();
    },
    announce() {
      if (remembered) o.send({ t: 'schoolDone' });
    },
    refreshCaptain() {
      $('schoolall').style.display = o.isCaptain() ? '' : 'none';
    },
  };
}
