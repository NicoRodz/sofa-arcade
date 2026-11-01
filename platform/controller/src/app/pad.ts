// The pad: the stick (nipplejs), the buttons A and B, the campaign's signal pad and the input packets they feed.
import nipplejs from 'nipplejs';
import { DEADZONE, INPUT_HZ, PRESS_MOD, applyDeadzone } from '@pichi/core';
import { send, type Session } from './store';

export function sendInput(s: Session) {
  if (!s.joined || (s.phase !== 'playing' && s.phase !== 'school')) return;
  const p = s.pad;
  send(s, {
    t: 'input',
    seq: p.seq++,
    x: p.x,
    y: p.y,
    btn: p.btn,
    presses: p.presses,
    ts: Date.now(),
    ...(s.signalsOn ? { sig: p.sig, go: p.go } : {}),
  });
}

/** Binds the touch controls once and starts the input timer. */
export function startPad(s: Session) {
  const { $, pad } = s;
  const tick = () => sendInput(s);
  const stick = nipplejs.create({ zone: $('zone'), mode: 'dynamic', color: 'white', size: 130, threshold: DEADZONE });
  stick.on('move', (e) => {
    const [x, y] = applyDeadzone(e.data.vector.x, -e.data.vector.y);
    pad.x = x;
    pad.y = y;
  });
  stick.on('start', () => $('stickhint').classList.add('active'));
  stick.on('end', () => {
    pad.x = 0;
    pad.y = 0;
    $('stickhint').classList.remove('active');
  });

  const bindButton = (el: HTMLElement, i: number) => {
    let activePointer: number | null = null;
    const release = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      pad.btn &= ~(1 << i);
      el.classList.remove('down');
      tick();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (activePointer !== null) return;
      activePointer = e.pointerId;
      el.setPointerCapture(e.pointerId);
      pad.btn |= 1 << i;
      pad.presses[i] = (pad.presses[i]! + 1) % PRESS_MOD;
      el.classList.add('down');
      tick();
    });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  };
  bindButton($('btnA'), 0);
  bindButton($('btnB'), 1);
  for (const el of Array.from(s.root.querySelectorAll<HTMLElement>('#signals [data-sig]'))) {
    // the campaign's signal pad: a press = one signal; "¡Ya!" also holds `go`
    const kind = el.dataset.sig as string;
    let activePointer: number | null = null;
    const release = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      if (kind === 'go') pad.go = false;
      el.classList.remove('down');
      tick();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (activePointer !== null || !s.signalsOn) return;
      activePointer = e.pointerId;
      el.setPointerCapture(e.pointerId);
      pad.sig = { kind, seq: (pad.sig.seq + 1) % PRESS_MOD };
      if (kind === 'go') pad.go = true;
      el.classList.add('down');
      try {
        navigator.vibrate?.(8);
      } catch {
        /* no vibration API (iOS) */
      }
      tick();
    });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }
  setInterval(tick, 1000 / INPUT_HZ);
}
