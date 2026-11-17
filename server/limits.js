// Rate limits and input cleaning shared by the HTTP routes and the game rooms.
import { randomInt } from 'node:crypto';

// a token bucket: `rate` actions a second on average, up to `burst` at once
export class Bucket {
  constructor(rate, burst) { this.rate = rate; this.burst = burst; this.n = burst; this.t = Date.now(); }
  take(k = 1) {
    const now = Date.now(); this.n = Math.min(this.burst, this.n + (now - this.t) / 1000 * this.rate); this.t = now;
    if (this.n < k) return false;
    this.n -= k; return true;
  }
}

// one bucket per key (an IP address), forgotten once idle
export function keyed(rate, burst) {
  const m = new Map();
  setInterval(() => { const old = Date.now() - 10 * 60e3; for (const [k, b] of m) if (b.t < old) m.delete(k); }, 60e3).unref();
  return key => { let b = m.get(key); if (!b) m.set(key, b = new Bucket(rate, burst)); return b.take(); };
}

export const ipOf = req => String((req.headers && req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown');

export const num = (v, lo, hi, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
export const int = (v, lo, hi, d) => Math.round(num(typeof v === 'string' ? Number(v) : v, lo, hi, d));
// names people choose: printable, no markup, single spaces
export function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// invitation codes: six letters and digits, leaving out the ones that are easy to misread (0/O, 1/I/L)
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeCode(taken) {
  for (;;) {
    let c = '';
    for (let i = 0; i < 6; i++) c += ALPHA[randomInt(ALPHA.length)];
    if (!taken.has(c)) return c;
  }
}
export const normCode = s => (typeof s === 'string' ? s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : '');
