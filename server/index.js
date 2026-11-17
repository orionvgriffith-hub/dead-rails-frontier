// Dead Rails Frontier multiplayer server: serves the game, lists public sessions, turns invitation codes into
// sessions, and runs every session as a Colyseus room (room.js). Run with `npm start` (see SERVER.md).
//   PORT    port to listen on (default 2567)
//   REGION  shown in the server list as the connection region (default "Local")
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import express from 'express';
import colyseus from 'colyseus';
import wsTransport from '@colyseus/ws-transport';
import { SurvivalRoom, CODES } from './room.js';
import { keyed, ipOf, normCode } from './limits.js';

const { Server, matchMaker } = colyseus;
const { WebSocketTransport } = wsTransport;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const PORT = Number(process.env.PORT) || 2567;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '2kb' }));
// the API can be reached from a copy of the game hosted elsewhere (no cookies are involved)
app.use('/api', (req, res, next) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST' });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const listLimit = keyed(2, 10), codeLimit = keyed(0.2, 6); // codes: a few guesses, then one every five seconds
app.get('/api/health', (req, res) => res.json({ ok: true, game: 'dead-rails-frontier' }));
// public sessions that are running now (private and friends sessions are never listed)
app.get('/api/servers', async (req, res) => {
  if (!listLimit(ipOf(req))) return res.status(429).json({ err: 'Too many requests' });
  const rooms = await matchMaker.query({ name: 'survival' });
  res.json(rooms.filter(r => !r.private && r.metadata && r.metadata.visibility === 'public').map(r => ({
    id: r.roomId, players: r.clients, max: r.maxClients, locked: !!r.locked,
    name: r.metadata.name, difficulty: r.metadata.difficulty, biome: r.metadata.biome, km: r.metadata.km,
    region: r.metadata.region, mode: r.metadata.mode, started: r.metadata.started,
  })));
});
// an invitation code to the session it opens; the room checks the code again when you actually join
app.post('/api/code', (req, res) => {
  if (!codeLimit(ipOf(req))) return res.status(429).json({ err: 'Too many tries. Wait a moment.' });
  const code = normCode(req.body && req.body.code), id = code.length === 6 && CODES.get(code);
  if (!id) return res.status(404).json({ err: 'No server with that code' });
  res.json({ id });
});

// the Colyseus browser client, from the installed package
app.get('/colyseus.js', (req, res) => res.sendFile(require.resolve('colyseus.js/dist/colyseus.js')));
// three.js: the game imports it from the Dia preview's CDN, which ordinary browsers may not be able to reach. The
// server fetches the same files once and serves them, and an import map in the page points the game at them; if
// the CDN can't be reached either, the copy installed with the server is used
const THREE_CDN = 'https://artifactcdn.diabrowser.engineering/ajax/libs/three.js/';
const VENDOR = new Map();
async function vendor(f) {
  if (VENDOR.has(f)) return VENDOR.get(f);
  let src = null;
  try { const r = await fetch(THREE_CDN + f); if (r.ok) src = await r.text(); } catch (e) { /* offline: use the package */ }
  if (src == null) try { src = await fs.readFile(require.resolve('three/build/' + f), 'utf8'); } catch (e) { return null; }
  VENDOR.set(f, src); return src;
}
app.get('/vendor/:f', async (req, res) => {
  if (!/^three\.(module|core)\.js$/.test(req.params.f)) return res.sendStatus(404);
  const src = await vendor(req.params.f); if (src == null) return res.sendStatus(404);
  res.type('application/javascript').set('Cache-Control', 'public, max-age=86400').send(src);
});
app.get(['/', '/index.html'], async (req, res) => {
  const map = { imports: { [THREE_CDN + 'three.module.js']: '/vendor/three.module.js' } };
  const html = (await fs.readFile(path.join(ROOT, 'index.html'), 'utf8')).replace('<head>', `<head>\n<script type="importmap">${JSON.stringify(map)}</script>`);
  res.type('html').send(html);
});
// the game itself; never the server's own files
app.use((req, res, next) => (/^\/(server|node_modules|package(-lock)?\.json|SERVER\.md)/i.test(req.path) ? res.sendStatus(404) : next()));
app.use(express.static(ROOT, { dotfiles: 'ignore', index: 'index.html' }));

const httpServer = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer, pingInterval: 5000, pingMaxRetries: 3 }) });
gameServer.define('survival', SurvivalRoom);
gameServer.listen(PORT).then(() => console.log(`Dead Rails Frontier: http://localhost:${PORT}`));

// a clean stop (Ctrl+C, or the host restarting): everyone is told the server is going down
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { console.log('Shutting down'); gameServer.gracefullyShutdown(true).catch(() => process.exit(0)); });
