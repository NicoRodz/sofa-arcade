import { WebSocket } from 'ws';
import { PORT, sleep } from '../config';
import type { Ctx } from '../session';

export async function runPhone({ cdp, open, join }: Ctx) {
  // a real controller page in a phone-sized emulated viewport, driven by a fake screen that sends config and phase
  const room = 'PHON';
  const fake = new WebSocket(`ws://127.0.0.1:${PORT}/ws?role=screen&room=${room}`);
  await new Promise((r) => fake.once('open', r));
  const cfg = { t: 'config', game: 'pizzas', difficulty: 'normal', map: '1', seed: 1 };
  fake.send(JSON.stringify(cfg));
  fake.send(JSON.stringify({ t: 'phase', phase: 'menu' })); // the screen is still on the Pichiclub start
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/c/?room=${room}` });
  await sleep(1200);
  await cdp.shot('phone-join');
  await cdp.eval(`document.getElementById('name').value = 'Nico'; document.getElementById('join').requestSubmit()`);
  await sleep(1200);
  await cdp.shot('phone-menu');
  console.log(
    'in the menu: view =',
    await cdp.eval(`document.body.dataset.view`),
    ', how-to card =',
    await cdp.eval(`document.body.dataset.howto`),
    ', text =',
    JSON.stringify(await cdp.eval(`document.querySelector('#choosing .big').textContent`)),
  );
  fake.send(JSON.stringify({ t: 'phase', phase: 'lobby' }));
  await sleep(600); // the screen picked the game
  await cdp.shot('phone-lobby');
  console.log('how-to card open after joining:', await cdp.eval(`document.body.dataset.howto`));
  const tap = async (x: number, y: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(400);
  };
  await tap(422, 195);
  console.log('after one tap:', await cdp.eval(`document.body.dataset.howto`));
  await cdp.shot('phone-lobby-closed');
  const ob = await cdp.eval<{ x: number; y: number }>(
    `(() => { const b = document.getElementById('howtoopen').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
  );
  await tap(ob.x, ob.y);
  console.log('after tapping "Cómo se juega":', await cdp.eval(`document.body.dataset.howto`));
  await tap(422, 195);
  fake.send(
    JSON.stringify({
      t: 'phase',
      phase: 'playing',
      puestos: {
        cheese: true,
        sink: true,
        assign: [{ id: 1, puestos: ['horno', 'reparto'], pool: ['masa', 'corte', 'queso', 'horno', 'reparto', 'lavado', 'apoyo'] }],
      },
    }),
  );
  await sleep(800);
  await cdp.shot('phone-play');
  // R7: buzz from the screen. Android path (vibrate exists and works) and the iOS path (no vibration: the phone flashes its colour)
  await cdp.eval(`Object.defineProperty(navigator, 'vibrate', { value: (p) => { window.__vib = p; return true; }, configurable: true })`);
  fake.send(JSON.stringify({ t: 'buzz', playerId: 1, kind: 'pick' }));
  await sleep(300);
  console.log('vibrate called with:', JSON.stringify(await cdp.eval('window.__vib')));
  fake.send(JSON.stringify({ t: 'buzz', playerId: 1, kind: 'chop' }));
  await sleep(300);
  console.log('vibrate called with:', JSON.stringify(await cdp.eval('window.__vib')));
  await cdp.eval(`Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })`);
  fake.send(JSON.stringify({ t: 'buzz', playerId: 1, kind: 'pick' }));
  await sleep(40);
  console.log('no vibrate API: flash class on body =', await cdp.eval(`document.body.classList.contains('flash')`));
  await cdp.shot('phone-flash');
  await sleep(300);
  console.log('flash gone after 300 ms =', await cdp.eval(`!document.body.classList.contains('flash')`));
  const r = await cdp.eval<{ x: number; y: number }>(
    `(() => { const b = document.getElementById('btnB').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
  );
  const sw = await cdp.eval<{ x: number; y: number }>(
    `(() => { const b = document.getElementById('pswap').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
  );
  await tap(sw.x, sw.y);
  console.log('after Cambiar:', await cdp.eval(`document.getElementById('pname').textContent`));
  await cdp.shot('phone-play-swap');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
  await sleep(250);
  await cdp.shot('phone-play-hold');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // zoom defenses: cancelable gesture events, double-tap touchend, and the visualViewport.scale check
  const prevented = await cdp.eval<Record<string, boolean>>(`(() => {
      const r = {};
      for (const t of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) { const e = new Event(t, { cancelable: true, bubbles: true }); document.body.dispatchEvent(e); r[t] = e.defaultPrevented; }
      const a = new Event('touchend', { cancelable: true, bubbles: true }); document.dispatchEvent(a);
      const b = new Event('touchend', { cancelable: true, bubbles: true }); document.dispatchEvent(b);
      r.secondTouchend = b.defaultPrevented;
      return r;
    })()`);
  console.log('prevented:', JSON.stringify(prevented));
  // a real pinch (synthesized by CDP): the touchstart guard should keep the scale at 1
  await cdp.send('Input.synthesizePinchGesture', { x: 420, y: 200, scaleFactor: 2.5, relativeSpeed: 400 });
  await sleep(600);
  console.log('scale after a real pinch:', await cdp.eval('visualViewport.scale'));
  // wiring of the banner: force the reported scale (headless cannot reproduce the iOS zoom state)
  await cdp.eval(
    `window.__fakeScale = 2.5; Object.defineProperty(visualViewport, 'scale', { get: () => window.__fakeScale, configurable: true }); visualViewport.dispatchEvent(new Event('resize'))`,
  );
  await sleep(1500);
  console.log('banner shown with scale 2.5:', await cdp.eval(`document.body.classList.contains('zoomed')`));
  await cdp.shot('phone-zoomed');
  await cdp.eval(`window.__fakeScale = 1; visualViewport.dispatchEvent(new Event('resize'))`);
  await sleep(300);
  console.log('banner after scale back to 1:', await cdp.eval(`document.body.classList.contains('zoomed')`));
  fake.close();
}

export async function runVersusPhone({ cdp, open, join }: Ctx) {
  // the controller in versus: team card + "Cambiar de equipo" in the lobby, the team strip on the pad. A fake screen owns the teams (the real one does the same).
  const room = 'VSPH';
  const fake = new WebSocket(`ws://127.0.0.1:${PORT}/ws?role=screen&room=${room}`);
  await new Promise((r) => fake.once('open', r));
  const got: string[] = [];
  fake.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.t === 'setTeam') got.push(JSON.stringify(m));
  });
  const team = (id: number, name: string, color: string, icon: string, side: string, playerIds: number[]) => ({
    id,
    name,
    color,
    icon,
    side,
    playerIds,
  });
  const cfg = (locked: boolean, a: number[], b: number[]) => ({
    t: 'config',
    game: 'pizzas',
    difficulty: 'normal',
    map: 'V1',
    seed: 1,
    modeId: 'versus',
    teamsLocked: locked,
    modeOptions: { hiddenScore: true, handicap: true },
    teams: [team(0, 'Picantes', '#A8330A', '▲', 'izquierda', a), team(1, 'Frescos', '#14338A', '●', 'derecha', b)],
  });
  fake.send(JSON.stringify(cfg(false, [1, 2, 3], [4, 5, 6])));
  fake.send(JSON.stringify({ t: 'phase', phase: 'lobby' }));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/c/?room=${room}` });
  await sleep(1200);
  await cdp.eval(`document.getElementById('name').value = 'Nico'; document.getElementById('join').requestSubmit()`);
  await sleep(1200);
  await cdp.eval(`document.getElementById('howto').dispatchEvent(new PointerEvent('pointerup'))`);
  await sleep(300);
  await cdp.shot('vsphone-lobby');
  const tap = async (sel: string) => {
    const r = await cdp.eval<{ x: number; y: number }>(
      `(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
    );
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(400);
  };
  await tap('#teamswap');
  console.log('screen got:', got.join(' '));
  fake.send(JSON.stringify(cfg(false, [2, 3], [4, 5, 6, 1])));
  await sleep(500); // the host applies the move
  console.log(
    'strip after the move:',
    await cdp.eval(`document.getElementById('tcname').textContent + ' ' + document.getElementById('tcside').textContent`),
  );
  await cdp.shot('vsphone-lobby-moved');
  fake.send(JSON.stringify(cfg(true, [2, 3], [4, 5, 6, 1])));
  await sleep(400);
  console.log(
    'swap disabled when locked:',
    await cdp.eval(`document.getElementById('teamswap').disabled`),
    await cdp.eval(`document.getElementById('teamswap').textContent`),
  );
  await cdp.shot('vsphone-lobby-locked');
  fake.send(JSON.stringify({ t: 'phase', phase: 'playing' }));
  await sleep(600);
  await cdp.shot('vsphone-play');
  const res = (verdict: string, winner: number | null) => ({
    t: 'phase',
    phase: 'results',
    scores: [{ id: 1, score: 410 }],
    result: {
      verdict,
      winner,
      scores: [
        { team: 0, score: 410 },
        { team: 1, score: 340 },
      ],
    },
  });
  fake.send(JSON.stringify(cfg(true, [1, 2, 3], [4, 5, 6])));
  fake.send(JSON.stringify(res('win', 0)));
  await sleep(500); // the phone is in team 0
  await cdp.shot('vsphone-results-won');
  fake.send(JSON.stringify(res('win', 1)));
  await sleep(400);
  await cdp.shot('vsphone-results-lost');
  fake.send(JSON.stringify(res('draw', null)));
  await sleep(400);
  await cdp.shot('vsphone-results-draw');
  fake.send(JSON.stringify(Object.assign(cfg(true, [1, 2, 3], [4, 5, 6]), { modeId: 'coop', teams: null })));
  await sleep(400);
  console.log('coop again: team strip =', await cdp.eval(`document.body.dataset.team`));
  fake.close();
}
