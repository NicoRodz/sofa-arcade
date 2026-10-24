// End-to-end check of the Captain's remote: the real screen in headless Chrome, the real relay, and phones played by bots over ws.
// The captain bot walks start -> lobby -> how-to card -> round -> results -> back; the other phone is ignored; a fake `from`, a
// message injected straight into the screen and a keyboard press racing a D-pad press are all refused.
// usage: npx tsx tools/menu-remote-e2e.ts   (needs `npm run build`; uses :3900 and CDP :9390)
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../server/src/server';
import type { ClientMsg, ServerMsg } from '../shared/protocol';

const PORT = Number(process.env.E2E_PORT ?? 3900), CDP = Number(process.env.E2E_CDP ?? 9390);
const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOM = 'e2e';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function descendants(pid: number): number[] {
  const rows = execSync('ps -A -o pid=,ppid=').toString().trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
  const out: number[] = [];
  const walk = (p: number) => { for (const [c, pp] of rows) if (pp === p && c !== undefined) { out.push(c); walk(c); } };
  walk(pid);
  return out;
}
async function killTree(proc: ChildProcess) {
  if (!proc.pid) return;
  const pids = [proc.pid, ...descendants(proc.pid)];
  for (const p of pids) { try { process.kill(p, 'SIGTERM'); } catch { /* gone */ } }
  await sleep(600);
  for (const p of pids) { try { process.kill(p, 0); process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
}

class Cdp {
  private id = 0;
  private pending = new Map<number, (v: any) => void>();
  readonly errors: string[] = [];
  constructor(private ws: WebSocket) {
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)!(m); this.pending.delete(m.id); }
      else if (m.method === 'Runtime.exceptionThrown') this.errors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
    });
  }
  send(method: string, params: object = {}): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result))); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval<T = unknown>(expr: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value as T;
  }
  async key(key: string, code: string, vk: number) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  }
}

class Phone {
  ws: WebSocket;
  id = 0;
  captain: number | null | undefined;
  constructor(readonly name: string, readonly token: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${ROOM}`);
    this.ws.on('open', () => this.send({ t: 'join', name, token }));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      if (m.t === 'joined') this.id = m.player.id;
      if (m.t === 'captain') this.captain = m.playerId;
    });
  }
  send(m: ClientMsg | string) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }
  nav(key: string) { this.send({ t: 'nav', key } as ClientMsg); }
}

let failures = 0;
const check = (ok: boolean, what: string, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`); if (!ok) failures++; };

async function main() {
  const srv = await startServer({ port: PORT, mode: 'static' });
  const dog = setTimeout(() => { console.error('watchdog fired'); process.exit(2); }, 120_000);
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-e2e-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1920,1080', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--ignore-gpu-blocklist', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
  const phones: Phone[] = [];
  try {
    let targets: any[] = [];
    for (let i = 0; i < 60 && !targets.length; i++) { await sleep(200); try { targets = ((await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()) as any[]).filter((t) => t.type === 'page'); } catch { /* not up yet */ } }
    if (!targets.length) throw new Error('Chrome did not start');
    const cws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((r) => cws.once('open', r));
    const cdp = new Cdp(cws);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${ROOM}` });
    const pg = <T>(expr: string) => cdp.eval<T>(`window.__pg.${expr}`);
    const phase = () => pg<string>('snapshot().phase');
    for (let i = 0; i < 60; i++) { try { if (await cdp.eval<boolean>(`typeof window.__pg === 'object'`)) break; } catch { /* loading */ } await sleep(200); }
    await sleep(800);

    // two phones join: the first one is the Captain, the second one is not
    const cap = new Phone('Capi', 'e2e-capi'), other = new Phone('Otro', 'e2e-otro');
    phones.push(cap, other);
    for (let i = 0; i < 50 && !(cap.id && other.id && cap.captain === cap.id && other.captain === cap.id); i++) await sleep(100);
    check(cap.id === 1 && other.id === 2, 'two phones joined', `ids ${cap.id}, ${other.id}`);
    check(cap.captain === cap.id && other.captain === cap.id, 'both phones are told the first one holds the crown', `${cap.captain}, ${other.captain}`);
    check((await pg<number | null>('captain()')) === cap.id, 'the screen knows the captain');
    check((await cdp.eval<string>(`document.querySelector('#chips .chip:not(.empty) .nm').textContent`)).includes('👑'), 'the captain\'s chip wears the crown on the TV');
    check((await cdp.eval<string>(`[...document.querySelectorAll('#chips .chip')].filter((c) => !c.classList.contains('empty')).map((c) => c.querySelector('.nm').textContent).join('|')`)) === '👑 Capi|Otro', 'only the captain\'s chip has the crown');
    check((await phase()) === 'menu', 'the screen starts at the menu');
    const cards = await pg<{ cards: string[] }>('menu()');
    check(cards.cards[0] === 'pizzas:ready', 'the pizzas card is pickable with 2 players', cards.cards.join(','));

    // 1. a phone that is not the captain does nothing, however it asks
    other.nav('ok'); other.nav('ok');
    other.send(`{"t":"nav","key":"ok","from":${cap.id},"playerId":${cap.id}}`); // poses as the captain
    await sleep(900);
    check((await phase()) === 'menu', 'the non-captain\'s OK (and one posing as the captain) is ignored at the menu');
    // 2. a nav that reaches the screen with a wrong id (as if the relay were bypassed) is refused by the screen itself
    await cdp.eval(`window.__pg.deliver({ t: 'nav', from: ${other.id}, key: 'ok' })`);
    await cdp.eval(`window.__pg.deliver({ t: 'nav', from: 999, key: 'ok' })`);
    await sleep(900);
    check((await phase()) === 'menu', 'the screen itself refuses a nav whose id is not the captain\'s');

    // 3. the captain: menu -> lobby
    cap.nav('right'); cap.nav('down'); cap.nav('left'); cap.nav('up'); // moves on a one-game grid: nothing breaks
    await sleep(200);
    check((await phase()) === 'menu', 'arrows alone do not leave the menu');
    cap.nav('ok');
    for (let i = 0; i < 30 && (await phase()) !== 'lobby'; i++) await sleep(100);
    check((await phase()) === 'lobby', 'captain OK picks the game: menu -> lobby');
    check((await cdp.eval<string>(`document.getElementById('title').textContent`)).length > 0 && !(await cdp.eval<boolean>(`document.getElementById('lobbyui').classList.contains('off')`)), 'the lobby is on screen');
    await sleep(500);

    // 4. help opens the how-to card on the TV, OK closes it (the same as H and Enter on the keyboard)
    const howtoOpen = () => cdp.eval<boolean>(`!document.getElementById('howto').classList.contains('off')`);
    cap.nav('help'); await sleep(400);
    check(await howtoOpen(), 'captain ? opens the "Cómo se juega" card on the TV');
    other.nav('ok'); await sleep(400);
    check(await howtoOpen(), 'the non-captain cannot close it');
    cap.nav('ok'); await sleep(400);
    check(!(await howtoOpen()), 'captain OK closes it');

    // 5. back -> menu, then OK -> lobby again
    cap.nav('back');
    for (let i = 0; i < 30 && (await phase()) !== 'menu'; i++) await sleep(100);
    check((await phase()) === 'menu', 'captain Atrás in the lobby goes back to the menu');
    await sleep(500);
    // the keyboard keeps the last word: Esc on the Mac, then a captain OK within the quiet window is dropped
    cap.nav('ok');
    for (let i = 0; i < 30 && (await phase()) !== 'lobby'; i++) await sleep(100);
    await sleep(700);
    await cdp.key('Escape', 'Escape', 27);
    cap.nav('ok'); // lands inside the 300 ms window after the key: dropped
    for (let i = 0; i < 30 && (await phase()) !== 'menu'; i++) await sleep(100);
    await sleep(900);
    check((await phase()) === 'menu', 'the keyboard Esc wins over a captain OK that arrives right after it');
    await sleep(500);
    cap.nav('ok');
    for (let i = 0; i < 30 && (await phase()) !== 'lobby'; i++) await sleep(100);
    check((await phase()) === 'lobby', 'once the quiet window is over the captain\'s OK works again');
    await sleep(700);

    // 6. start the round: OK in the lobby opens the card, OK skips it (the same Enter, Enter as on the Mac)
    cap.nav('ok');
    await sleep(900);
    check(await howtoOpen(), 'captain OK in the lobby starts the round: the how-to card shows');
    other.nav('ok'); await sleep(500);
    check(await howtoOpen(), 'the non-captain cannot skip the card');
    cap.nav('ok');
    for (let i = 0; i < 40 && (await phase()) !== 'playing'; i++) await sleep(100);
    check((await phase()) === 'playing', 'captain OK skips the card: lobby -> playing');
    cap.nav('back'); cap.nav('ok'); cap.nav('help'); await sleep(400);
    check((await phase()) === 'playing', 'during the round the D-pad does nothing');

    // 7. results: captain OK goes back to the lobby; the other phone cannot
    await pg('fastForward(100)');
    for (let i = 0; i < 60 && (await phase()) !== 'results'; i++) await sleep(100);
    check((await phase()) === 'results', 'the round ends in the results');
    other.nav('ok'); await sleep(500);
    check((await phase()) === 'results', 'the non-captain\'s OK does nothing at the results');
    cap.nav('ok'); await sleep(500);
    check((await phase()) === 'lobby', 'captain OK at the results goes back to the lobby');

    // 8. the captain drops: the crown passes to the other phone, whose D-pad now works; the old one is ignored
    cap.ws.close();
    for (let i = 0; i < 40 && other.captain !== other.id; i++) await sleep(100);
    check(other.captain === other.id, 'when the captain disconnects the crown passes to the other phone');
    await sleep(300);
    check((await cdp.eval<string>(`[...document.querySelectorAll('#chips .chip:not(.empty) .nm')].map((n) => n.textContent).join('|')`)).includes('👑 Otro'), 'the TV moves the crown to the new captain');
    await sleep(600);
    other.nav('back');
    for (let i = 0; i < 30 && (await phase()) !== 'menu'; i++) await sleep(100);
    check((await phase()) === 'menu', 'the new captain\'s Atrás works (lobby -> menu)');
    check(cdp.errors.length === 0, 'no page errors on the screen', cdp.errors.join(' | '));
  } finally {
    clearTimeout(dog);
    phones.forEach((p) => p.ws.close());
    await killTree(chrome);
    rmSync(profile, { recursive: true, force: true });
    await srv.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
