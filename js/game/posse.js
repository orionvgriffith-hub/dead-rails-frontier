// "Ride as a posse": play with friends online with no server of your own, the way Dead Man's Guild does it. One
// player hosts: their browser keeps the shared world (through Net, exactly as when it hosts other tabs) and every
// rider connects straight to it over WebRTC. Riders find the host by a five-letter room code through PeerJS's free
// public broker (it only introduces the two browsers, then steps out). If that can't be reached, the two players
// can swap connection codes by hand instead, which needs no service at all.
const VERSION = 1;                      // riders and host must match (shown in the menu)
const PREFIX = 'dead-rails-frontier-v1-';
const PEERJS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
const PIECE = 15000;                    // big messages (the world, on joining) go in pieces of this many characters
export const POSSE_VERSION = VERSION;
export const MAX_RIDERS = 6;            // the host and five friends

// one connection to one other player: JSON messages over a data channel, split into pieces when large
class Pipe {
  constructor(raw) { this.raw = raw; this.parts = new Map(); this.onmsg = null; this.onclose = null; this.open = true; this.who = null; }
  send(m) {
    if (!this.open) return;
    const s = JSON.stringify(m);
    try {
      if (s.length <= PIECE) this.raw.send(s);
      else {
        const id = Math.random().toString(36).slice(2, 8), n = Math.ceil(s.length / PIECE);
        for (let i = 0; i < n; i++) this.raw.send('\u0001' + id + ':' + i + ':' + n + ':' + s.slice(i * PIECE, (i + 1) * PIECE));
      }
    } catch (e) { /* the channel just closed */ }
  }
  data(s) {
    if (typeof s !== 'string') return;
    if (s.charCodeAt(0) === 1) {
      const a = s.indexOf(':'), b = s.indexOf(':', a + 1), c = s.indexOf(':', b + 1);
      const id = s.slice(1, a), i = +s.slice(a + 1, b), n = +s.slice(b + 1, c);
      let p = this.parts.get(id); if (!p) this.parts.set(id, p = { n, got: 0, a: [] });
      if (p.a[i] == null) { p.a[i] = s.slice(c + 1); p.got++; }
      if (p.got < p.n) return;
      this.parts.delete(id); s = p.a.join('');
    }
    let m; try { m = JSON.parse(s); } catch (e) { return; }
    this.onmsg && this.onmsg(m);
  }
  closed() { if (!this.open) return; this.open = false; this.onclose && this.onclose(); }
  close() { try { this.raw.close(); } catch (e) {} this.closed(); }
}

// the posse, in the shape Net wants: send(m) goes to everyone, listen(fn) hears anyone. The host is the hub:
// whatever a rider sends, the host acts on and passes on to the other riders
export class PosseLink {
  constructor(role) {
    this.role = role; this.pipes = new Set(); this.fn = null; this.q = []; this.code = null; this.peer = null; this.onlost = null;
    this.ready = new Promise((res, rej) => { this.ok = res; this.bad = rej; });
    this.ready.catch(() => {});
    if (role === 'host') this.ok();
  }
  listen(fn) { this.fn = fn; for (const m of this.q.splice(0)) fn(m); }
  hear(m) { if (this.fn) this.fn(m); else this.q.push(m); }
  add(pipe) {
    this.pipes.add(pipe);
    pipe.send({ k: 'pv', v: VERSION });
    pipe.onmsg = m => {
      if (!m || typeof m !== 'object') return;
      if (m.k === 'pv') { if (m.v === VERSION) this.ok(); else this.fail(pipe, `You have version ${VERSION} and they have version ${m.v}. Both reload the game to get the newest one`); return; }
      if (m.k === 'full') { this.fail(pipe, 'That posse is full'); return; }
      if ((m.k === 'hello' || m.k === 'here') && m.id && !pipe.who) pipe.who = m.id;
      if (this.role === 'host') for (const q of this.pipes) if (q !== pipe) q.send(m);
      this.hear(m);
    };
    pipe.onclose = () => {
      this.pipes.delete(pipe);
      if (this.role === 'host') { if (pipe.who) { const bye = { k: 'bye', id: pipe.who }; for (const q of this.pipes) q.send(bye); this.hear(bye); } }
      else { this.bad(new Error('Lost the connection to the host')); this.lost('The host ended the posse, or the connection dropped'); }
    };
  }
  fail(pipe, msg) { this.bad(new Error(msg)); pipe.onclose = null; pipe.close(); this.pipes.delete(pipe); if (this.role !== 'host') this.lost(msg); }
  lost(msg) { if (this.gone) return; this.gone = true; this.onlost && this.onlost(msg); }
  send(m) { for (const p of this.pipes) p.send(m); }
  get riders() { return this.pipes.size; }
  close() { this.gone = true; for (const p of [...this.pipes]) { p.onclose = null; p.close(); } this.pipes.clear(); if (this.peer) try { this.peer.destroy(); } catch (e) {} }
}

// ---------- room codes (PeerJS) ----------
function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = PEERJS; s.async = true;
    s.onload = () => (window.Peer ? res() : rej(new Error('Room codes are not working here. Swap codes by hand instead')));
    s.onerror = () => rej(new Error('Room codes are not working here. Swap codes by hand instead'));
    document.head.appendChild(s);
  });
}
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I/L to misread
export const cleanRoom = s => (typeof s === 'string' ? s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) : '');
function newCode() { let c = ''; const b = new Uint32Array(5); crypto.getRandomValues(b); for (const v of b) c += ALPHA[v % ALPHA.length]; return c; }
function why(e) {
  const t = e && e.type;
  if (t === 'peer-unavailable') return 'No posse with that code. Check it, and that the host is still in the game';
  if (t === 'browser-incompatible') return 'This browser cannot do posse play';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Could not reach the room service. Swap codes by hand instead';
  return (e && e.message) || 'Something went wrong';
}
// a PeerJS peer, ready (open) or failed within a few seconds
function makePeer(id) {
  return new Promise((res, rej) => {
    let done = false;
    const p = id ? new window.Peer(id, { config: { iceServers: ICE }, debug: 0 }) : new window.Peer({ config: { iceServers: ICE }, debug: 0 });
    const t = setTimeout(() => { if (done) return; done = true; try { p.destroy(); } catch (e) {} rej(new Error('Could not reach the room service. Swap codes by hand instead')); }, 10000);
    p.on('open', () => { if (done) return; done = true; clearTimeout(t); res(p); });
    p.on('error', e => { if (done) return; done = true; clearTimeout(t); try { p.destroy(); } catch (x) {} rej(e); });
  });
}
function pipeOf(conn) {
  const p = new Pipe(conn);
  conn.on('data', d => p.data(d)); conn.on('close', () => p.closed()); conn.on('error', () => p.closed());
  return p;
}
// host: open a room and take riders as they come (the code is link.code)
export async function hostRoom(link) {
  await loadPeerJS();
  for (let tries = 0; tries < 4; tries++) {
    const code = newCode();
    let peer;
    try { peer = await makePeer(PREFIX + code); }
    catch (e) { if (e && e.type === 'unavailable-id') continue; throw new Error(why(e)); }
    link.peer = peer; link.code = code;
    peer.on('connection', conn => conn.on('open', () => {
      if (link.riders >= MAX_RIDERS - 1) { try { conn.send(JSON.stringify({ k: 'full' })); } catch (e) {} setTimeout(() => conn.close(), 400); return; }
      link.add(pipeOf(conn));
    }));
    // losing the room service only stops new riders finding you; anyone already in stays connected
    peer.on('disconnected', () => { if (!link.gone) setTimeout(() => { try { peer.reconnect(); } catch (e) {} }, 3000); });
    peer.on('error', () => {});
    return code;
  }
  throw new Error('Could not make a room code. Try again');
}
// rider: find the host by code
export async function joinRoom(link, code) {
  code = cleanRoom(code);
  if (code.length !== 5) throw new Error('Room codes are five letters and numbers');
  await loadPeerJS();
  let peer;
  try { peer = await makePeer(); } catch (e) { throw new Error(why(e)); }
  link.peer = peer; link.code = code;
  await new Promise((res, rej) => {
    const conn = peer.connect(PREFIX + code, { serialization: 'raw', reliable: true });
    const t = setTimeout(() => rej(new Error("Couldn't connect to the host. Check the code, or try swapping codes by hand")), 15000);
    conn.on('open', () => { clearTimeout(t); link.add(pipeOf(conn)); res(); });
    peer.on('error', e => { clearTimeout(t); rej(new Error(why(e))); });
  }).catch(e => { link.close(); throw e; });
  await Promise.race([link.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('The host did not answer')), 8000))]);
}

// ---------- swapping codes by hand ----------
// a connection code: the offer or answer with its network routes, squeezed and turned into copyable text
async function pack(desc) {
  const s = JSON.stringify({ t: desc.type, s: desc.sdp, v: VERSION });
  if ('CompressionStream' in window) {
    const b = new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    let bin = ''; for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return 'DR1Z' + btoa(bin);
  }
  return 'DR1P' + btoa(unescape(encodeURIComponent(s)));
}
async function unpack(code) {
  code = (code || '').replace(/\s+/g, '');
  try {
    if (code.startsWith('DR1Z')) {
      const bin = atob(code.slice(4)), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
      return JSON.parse(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
    }
    if (code.startsWith('DR1P')) return JSON.parse(decodeURIComponent(escape(atob(code.slice(4)))));
  } catch (e) { /* fall through */ }
  throw new Error("That doesn't look like a whole code. Copy all of it and try again");
}
function gather(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(res => {
    const t = setTimeout(res, 5000);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}
function opened(dc, ms) {
  if (dc.readyState === 'open') return Promise.resolve();
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("Couldn't connect. Make sure each of you copied the whole code, or try another network")), ms);
    dc.onopen = () => { clearTimeout(t); res(); };
  });
}
function pipeOfDC(dc, pc) {
  const p = new Pipe(dc);
  dc.onmessage = e => p.data(e.data); dc.onclose = () => p.closed();
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') p.closed(); };
  return p;
}
// host: a code for one rider, and then their reply
export async function handOffer(link) {
  const pc = new RTCPeerConnection({ iceServers: ICE }), dc = pc.createDataChannel('posse', { ordered: true });
  await pc.setLocalDescription(await pc.createOffer()); await gather(pc);
  return {
    code: await pack(pc.localDescription),
    accept: async reply => {
      const d = await unpack(reply);
      if (d.t !== 'answer') throw new Error('That is your own code. Paste the reply code your friend sends back');
      if (d.v !== VERSION) throw new Error(`Your friend has version ${d.v} and you have ${VERSION}. Both reload the game`);
      if (link.riders >= MAX_RIDERS - 1) throw new Error('The posse is full');
      await pc.setRemoteDescription({ type: 'answer', sdp: d.s });
      await opened(dc, 20000); link.add(pipeOfDC(dc, pc));
    },
    cancel: () => { try { pc.close(); } catch (e) {} },
  };
}
// rider: the host's code in, a reply code out; connected resolves once the host has pasted the reply
export async function handAnswer(link, offer) {
  const d = await unpack(offer);
  if (d.t !== 'offer') throw new Error("That's a reply code. Paste the code the host sends you");
  if (d.v !== VERSION) throw new Error(`The host has version ${d.v} and you have ${VERSION}. Both reload the game`);
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const chan = new Promise(res => { pc.ondatachannel = e => res(e.channel); });
  await pc.setRemoteDescription({ type: 'offer', sdp: d.s });
  await pc.setLocalDescription(await pc.createAnswer()); await gather(pc);
  return {
    code: await pack(pc.localDescription),
    connected: (async () => { const dc = await chan; await opened(dc, 180000); link.add(pipeOfDC(dc, pc)); await link.ready; })(),
    cancel: () => { try { pc.close(); } catch (e) {} },
  };
}
