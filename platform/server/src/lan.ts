import os from 'node:os';

const isPrivate = (a: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);

export function lanIp(): string {
  const all = Object.values(os.networkInterfaces()).flatMap((l) => l ?? []);
  const v4 = all.filter((i) => i.family === 'IPv4' && !i.internal);
  return (v4.find((i) => isPrivate(i.address)) ?? v4[0])?.address ?? 'localhost';
}
