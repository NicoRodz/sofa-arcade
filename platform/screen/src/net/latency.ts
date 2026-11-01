// Latency instrumentation and the debug panel (D key): RTT per phone, phone -> screen lag, packets per second, CSV export.
// Moved out of apps/screen/src/main.ts (F4b) unchanged.
import { percentile } from '@pichi/core';
import { $, num0 } from '../ui/dom';
import { app, sync, type PlayerRec } from '../shell/app-state';

const csv: string[] = [];
const pendingLag: { id: number; sendServerTime: number }[] = [];
export const latency = { screenRtt: NaN, totalPkts: 0, pktsRate: 0 };

export const record = (kind: 'rtt' | 'lag', p: PlayerRec, v: number) => {
  (kind === 'rtt' ? p.rtt : p.lag).push(v);
  csv.push(`${kind},${p.info.name}#${p.info.id},${Date.now()},${v.toFixed(2)}`);
};
export const queueLag = (id: number, sendServerTime: number) => pendingLag.push({ id, sendServerTime });

// Called right after the frame is drawn: closest browser-side proxy for "visible on screen".
export function flushLag() {
  const off = sync.offset;
  if (!pendingLag.length || off === null) return;
  const nowServer = Date.now() + off;
  for (const q of pendingLag.splice(0)) {
    const p = app.players.get(q.id);
    if (p) record('lag', p, nowServer - q.sendServerTime);
  }
}

export function initDebugPanel() {
  setInterval(() => {
    latency.pktsRate = latency.totalPkts;
    latency.totalPkts = 0;
    const rows = ['<tr><th>player</th><th>rtt last</th><th>p95</th><th>max</th><th>lag last</th><th>p95</th><th>pkt/s</th></tr>'];
    for (const p of app.players.values()) {
      p.pktsRate = p.pkts;
      p.pkts = 0;
      const r = p.rtt,
        l = p.lag;
      rows.push(
        `<tr style="color:${p.info.connected ? p.info.color : '#777'}"><td>${p.info.name}</td><td>${num0(r.at(-1) ?? NaN)}</td>` +
          `<td>${num0(percentile(r, 95))}</td><td>${num0(r.length ? Math.max(...r) : NaN)}</td>` +
          `<td>${num0(l.at(-1) ?? NaN)}</td><td>${num0(percentile(l, 95))}</td><td>${p.pktsRate}</td></tr>`,
      );
    }
    $('table').innerHTML = rows.join('');
    $('summary').textContent =
      `total ${latency.pktsRate} pkt/s | screen<->server RTT ${num0(latency.screenRtt)} ms | clock offset ${num0(sync.offset ?? NaN)} ms`;
    $('warn').textContent = document.hidden ? 'TAB HIDDEN: rendering paused, keep it in the foreground' : '';
  }, 250);

  $('csv').addEventListener('click', () => {
    const blob = new Blob(['kind,player,t_ms,value_ms\n' + csv.join('\n') + '\n'], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `f0-latency-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('clear').addEventListener('click', () => {
    csv.length = 0;
    for (const p of app.players.values()) {
      p.rtt = [];
      p.lag = [];
    }
  });
}
