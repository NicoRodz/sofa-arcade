// Page-level setup that belongs to no screen: the room code and QR, and the 1920x1080 stage scaled to the window. Moved out of main.ts (F4b).
import { joinUrl, NO_URL, type JoinView } from '../screens/lobby/model';
import { renderJoinCard } from '../screens/lobby/view';
import { app } from './app-state';

export function initPage() {
  const join: JoinView = { code: app.room, qrSvg: '', url: '' };
  renderJoinCard(join);
  fetch(`/api/info?room=${encodeURIComponent(app.room)}`)
    .then((r) => r.json())
    .then(({ url, qrSvg }: { url: string; qrSvg: string }) => renderJoinCard({ ...join, qrSvg, url: joinUrl(url) }))
    .catch(() => renderJoinCard({ ...join, url: NO_URL }));

  // layout: the 1920x1080 stage is scaled to the window
  const fit = () => document.documentElement.style.setProperty('--k', String(Math.min(innerWidth / 1920, innerHeight / 1080)));
  fit();
  addEventListener('resize', fit);
}
