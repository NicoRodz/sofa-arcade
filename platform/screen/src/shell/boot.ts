// Page-level setup that belongs to no screen: the room code and QR, and the 1920x1080 stage scaled to the window. Moved out of main.ts (F4b).
import { $ } from '../ui/dom';
import { app } from './app-state';

export function initPage() {
  $('code').textContent = app.room;
  fetch(`/api/info?room=${encodeURIComponent(app.room)}`)
    .then((r) => r.json())
    .then(({ url, qrSvg }: { url: string; qrSvg: string }) => {
      document.getElementById('qr')!.innerHTML = qrSvg;
      document.getElementById('joinurl')!.textContent = url.replace(/^http:\/\//, '');
    })
    .catch(() => {
      document.getElementById('joinurl')!.textContent = 'no se pudo obtener la URL';
    });

  // layout: the 1920x1080 stage is scaled to the window
  const fit = () => document.documentElement.style.setProperty('--k', String(Math.min(innerWidth / 1920, innerHeight / 1080)));
  fit();
  addEventListener('resize', fit);
}
