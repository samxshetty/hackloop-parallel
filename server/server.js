'use strict';
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const { maskSecrets } = require('./safety/mask');
const { reconcileGuestEdit } = require('./safety/edit-guard');
const { recordEdit, setRevoked, clearSession } = require('./safety/contributions');

const PORT = process.env.PORT || 8080;
const CODE_TTL_MS = 10 * 60 * 1000;   // a code accepts new joins for 10 minutes
const MAX_GUESTS = 20;                // approved plus waiting
const MAX_NAME = 30;
const MAX_BAD_CODES = 5;              // wrong codes per connection
const MAX_BAD_CODES_PER_IP = 20;      // wrong codes per IP per minute
const MAX_MSGS_PER_SEC = 200;         // per connection
const MAX_PAYLOAD = 5 * 1024 * 1024;  // 5 MB per message (the extension refuses to send files over 4 MB)
const MAX_TERM_DATA = 64 * 1024;      // terminal output per message
const MAX_TERM_INPUT = 4096;          // one command line typed by a host
const HEARTBEAT_MS = 15000;

const wss = new WebSocketServer({ port: PORT, maxPayload: MAX_PAYLOAD });
console.log(`Server running on ws://localhost:${PORT}`);

const sessions = new Map(); // code -> { host, peers: [], pending: [], createdAt }
const badByIp = new Map();  // ip -> { count, resetAt }

// ---------- helpers ----------

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

// fatal = true means a create/join was refused, so the client should leave cleanly
function fail(ws, text, fatal = false) {
  send(ws, fatal ? { t: 'error', msg: text, fatal: true } : { t: 'error', msg: text });
}

// 6 characters, no lookalikes (no 0/O, 1/I), from a secure random source
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join('');
  } while (sessions.has(code));
  return code;
}

const canEdit = (ws) => ws.role === 'superhost' || ws.role === 'host' || !!ws.canEdit;
const isEditor = canEdit;

// approved members only: the superhost and approved guests
const isMember = (ws, session) =>
  ws === session.host || session.peers.some((p) => p.ws === ws);

function everyone(session) {
  return [session.host, ...session.peers.map((p) => p.ws)];
}

function sendToAll(session, obj, except) {
  for (const w of everyone(session)) {
    if (w !== except) send(w, obj);
  }
}

// terminal data goes to promoted hosts only, never to guests
function sendToHosts(session, obj) {
  for (const p of session.peers) {
    if (p.ws.role === 'host') send(p.ws, obj);
  }
}

// send the participant list (names, roles, and edit permission) to everyone
function broadcastPeers(session) {
  const peers = session.peers.map((p) => ({
    name: p.name,
    role: p.ws.role,
    canEdit: !!p.ws.canEdit,
  }));
  sendToAll(session, { t: 'peers', list: peers.map((p) => p.name), peers });
}

function cleanName(n) {
  return typeof n === 'string' ? n.trim().slice(0, MAX_NAME) : '';
}

// names must be unique in a session (not case-sensitive), host included
function nameTaken(session, name) {
  const lower = name.toLowerCase();
  const all = [session.host, ...session.peers.map((p) => p.ws), ...session.pending.map((p) => p.ws)];
  return all.some((w) => w.name && w.name.toLowerCase() === lower);
}

function ipBlocked(ip) {
  const rec = badByIp.get(ip);
  return !!rec && Date.now() < rec.resetAt && rec.count > MAX_BAD_CODES_PER_IP;
}

// count a wrong code; returns true when this connection or IP has tried too often
function tooManyBadCodes(ws) {
  ws.badCodes = (ws.badCodes || 0) + 1;
  const now = Date.now();
  let rec = badByIp.get(ws.ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + 60000 };
    badByIp.set(ws.ip, rec);
  }
  rec.count++;
  return ws.badCodes >= MAX_BAD_CODES || rec.count > MAX_BAD_CODES_PER_IP;
}

// ---------- messages ----------

function handle(ws, data) {
  // simple flood protection
  const now = Date.now();
  if (now - ws.windowStart > 1000) { ws.windowStart = now; ws.msgCount = 0; }
  if (++ws.msgCount > MAX_MSGS_PER_SEC) { ws.terminate(); return; }

  let msg;
  try {
    msg = JSON.parse(data);
  } catch {
    fail(ws, 'bad json');
    return;
  }
  // JSON can also be null, a number or a list: only objects with a text "t" are valid
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') {
    fail(ws, 'bad message');
    return;
  }

  if (msg.t === 'doc') {
    console.log('recv:', { t: 'doc', file: msg.file, length: String(msg.text ?? '').length });
  } else if (msg.t === 'term_data' || msg.t === 'term_input') {
    // never write terminal contents (they may hold secrets) to the server log
    console.log('recv:', { t: msg.t, length: String(msg.data ?? '').length });
  } else {
    console.log('recv:', msg);
  }

  switch (msg.t) {
    case 'ping':
      send(ws, { t: 'pong' });
      break;

    case 'create': {
      if (ws.code) { fail(ws, 'already in a session'); break; }
      const name = cleanName(msg.name);
      if (!name) { fail(ws, 'name required', true); break; }
      const code = genCode();
      clearSession(code);
      sessions.set(code, { host: ws, code, peers: [], pending: [], createdAt: Date.now(), lastMaskedCount: 0, term: null });
      ws.role = 'superhost';
      ws.canEdit = true;
      ws.name = name;
      ws.code = code;
      send(ws, { t: 'created', code });
      break;
    }

    case 'join': {
      if (ws.code) { fail(ws, 'already in a session'); break; }
      if (ipBlocked(ws.ip)) { fail(ws, 'too many attempts, wait a minute', true); break; }
      const name = cleanName(msg.name);
      if (!name) { fail(ws, 'name required', true); break; }
      const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
      const session = sessions.get(code);
      if (!session) {
        if (tooManyBadCodes(ws)) {
          fail(ws, 'too many wrong codes', true);
          ws.close();
        } else {
          fail(ws, 'bad code', true);
        }
        break;
      }
      if (Date.now() - session.createdAt > CODE_TTL_MS) { fail(ws, 'code expired', true); break; }
      if (session.peers.length + session.pending.length >= MAX_GUESTS) { fail(ws, 'session full', true); break; }
      if (nameTaken(session, name)) { fail(ws, 'name taken', true); break; }
      ws.name = name;
      ws.role = 'guest';
      ws.canEdit = false;
      ws.code = code;
      session.pending.push({ ws, name });
      send(session.host, { t: 'join_request', name });
      break;
    }

    case 'decide': {
      if (ws.role !== 'superhost') break; // only the superhost approves or denies joins
      const session = sessions.get(ws.code);
      if (!session) break;
      const idx = session.pending.findIndex((p) => p.name === msg.name);
      if (idx === -1) { fail(ws, 'that person already left or was already decided'); break; }
      const [guest] = session.pending.splice(idx, 1);
      if (msg.approve) {
        guest.ws.canEdit = false;
        session.peers.push(guest);
        send(guest.ws, { t: 'joined', masked: session.lastMaskedCount });
        broadcastPeers(session);
        if (session.lastDoc) {
          send(guest.ws, { ...session.lastDoc, text: maskSecrets(session.lastDoc.text).text });
        }
      } else {
        send(guest.ws, { t: 'denied' });
      }
      break;
    }

    case 'doc': {
      if (!canEdit(ws)) { console.log('blocked guest doc'); break; }
      if (typeof msg.text !== 'string') break;
      const session = sessions.get(ws.code);
      if (!session) break;

      const isHostSender = ws.role === 'superhost' || ws.role === 'host';
      let rawText = msg.text;
      let editChange = null;

      if (!isHostSender) {
        const res = reconcileGuestEdit(
          session.lastRaw ?? session.lastDoc?.text ?? '',
          session.lastMasked ?? '',
          session.lastSpans ?? [],
          msg.text
        );
        if (!res.ok) {
          fail(ws, res.error);
          if (session.lastMasked !== undefined) {
            send(ws, { t: 'doc', text: session.lastMasked, file: msg.file || session.lastDoc?.file });
          }
          break;
        }
        rawText = res.rawNew;
        editChange = res.change;
      }

      const prevRaw = session.lastRaw ?? session.lastDoc?.text ?? '';
      session.lastRaw = rawText;
      const { text: maskedText, count, kinds, spans } = maskSecrets(rawText);
      session.lastMasked = maskedText;
      session.lastSpans = spans;
      session.lastDoc = { t: 'doc', text: rawText, file: msg.file };

      if (!isHostSender) {
        recordEdit(session, ws, prevRaw, rawText, editChange, send);
      }

      if (session.lastMaskedCount !== count) {
        session.lastMaskedCount = count;
        send(session.host, { t: 'masked', count, kinds });
      }

      const rawDoc = { ...msg, text: rawText };
      const maskedDoc = { ...msg, text: maskedText };
      for (const w of everyone(session)) {
        if (w !== ws) {
          send(w, (w.role === 'superhost' || w.role === 'host') ? rawDoc : maskedDoc);
        }
      }
      break;
    }

    case 'cursor': {
      const session = sessions.get(ws.code);
      if (!session || !isMember(ws, session)) break;
      if (!Number.isInteger(msg.line) || !Number.isInteger(msg.character)) break;
      sendToAll(session, {
        t: 'cursor',
        name: ws.name,
        line: msg.line,
        character: msg.character,
      }, ws);
      break;
    }

    case 'request_edit': {
      const session = sessions.get(ws.code);
      if (!session || !isMember(ws, session)) break;
      if (canEdit(ws)) {
        fail(ws, 'already an editor');
        break;
      }
      send(session.host, { t: 'edit_request', name: ws.name });
      break;
    }

    case 'decide_edit': {
      if (ws.role !== 'superhost') {
        fail(ws, 'only superhost can decide edit requests');
        break;
      }
      const session = sessions.get(ws.code);
      if (!session) break;
      const target = session.peers.find((p) => p.name === msg.name);
      if (!target) { fail(ws, 'no such person'); break; }
      if (msg.approve) {
        target.ws.canEdit = true;
        setRevoked(session, target.name, false, send);
        send(target.ws, { t: 'edit_status', canEdit: true });
        sendToAll(session, { t: 'edit_granted', name: target.name });
        broadcastPeers(session);
      } else {
        target.ws.canEdit = false;
        send(target.ws, { t: 'edit_status', canEdit: false });
        send(target.ws, { t: 'edit_denied', name: target.name });
      }
      break;
    }

    case 'revoke_edit': {
      if (ws.role !== 'superhost') {
        fail(ws, 'only superhost can revoke edit access');
        break;
      }
      const session = sessions.get(ws.code);
      if (!session) break;
      const target = session.peers.find((p) => p.name === msg.name);
      if (!target) { fail(ws, 'no such person'); break; }
      if (target.ws.role === 'host') {
        fail(ws, 'that person is a host: change their role to guest instead');
        break;
      }
      target.ws.canEdit = false;
      setRevoked(session, target.name, true, send);
      send(target.ws, { t: 'edit_status', canEdit: false });
      sendToAll(session, { t: 'edit_revoked', name: target.name });
      broadcastPeers(session);
      break;
    }


    // ----- shared terminal: superhost -> hosts only, never guests -----
    case 'term_open': {
      if (ws.role !== 'superhost') { fail(ws, 'only superhost can share a terminal'); break; }
      const session = sessions.get(ws.code);
      if (!session) break;
      session.term = { allowInput: false };
      sendToHosts(session, { t: 'term_open', allowInput: false });
      break;
    }

    case 'term_data': {
      if (ws.role !== 'superhost') break;
      const session = sessions.get(ws.code);
      if (!session || !session.term) break;
      if (typeof msg.data !== 'string' || msg.data.length > MAX_TERM_DATA) break;
      sendToHosts(session, { t: 'term_data', data: msg.data });
      break;
    }

    case 'term_allow_input': {
      if (ws.role !== 'superhost') { fail(ws, 'only superhost can switch terminal typing'); break; }
      const session = sessions.get(ws.code);
      if (!session || !session.term) break;
      session.term.allowInput = !!msg.allow;
      sendToHosts(session, { t: 'term_allow_input', allow: session.term.allowInput });
      break;
    }

    case 'term_close': {
      if (ws.role !== 'superhost') break;
      const session = sessions.get(ws.code);
      if (!session || !session.term) break;
      session.term = null;
      sendToHosts(session, { t: 'term_close' });
      break;
    }

    case 'term_input': {
      if (ws.role !== 'host') { fail(ws, 'only hosts can type in the shared terminal'); break; }
      const session = sessions.get(ws.code);
      if (!session || !isMember(ws, session)) break;
      if (!session.term || !session.term.allowInput) {
        fail(ws, 'typing in the terminal is switched off');
        break;
      }
      if (typeof msg.data !== 'string' || msg.data.length === 0 || msg.data.length > MAX_TERM_INPUT) break;
      // the name comes from the server, so a host cannot pretend to be someone else
      send(session.host, { t: 'term_input', name: ws.name, data: msg.data });
      break;
    }

    case 'role': {
      // only the superhost can promote or demote
      if (ws.role !== 'superhost') break;
      const session = sessions.get(ws.code);
      if (!session) break;
      if (msg.role !== 'host' && msg.role !== 'guest') break;
      const target = session.peers.find((p) => p.name === msg.name);
      if (!target) { fail(ws, 'no such person'); break; }
      target.ws.role = msg.role;
      if (msg.role === 'host') {
        target.ws.canEdit = true;
        setRevoked(session, target.name, false, send);
      } else if (msg.role === 'guest') {
        target.ws.canEdit = false;
        setRevoked(session, target.name, true, send);
      }
      send(target.ws, { t: 'role', role: msg.role });
      send(target.ws, { t: 'edit_status', canEdit: !!target.ws.canEdit });
      if (session.term) {
        // a newly promoted host sees the shared terminal; a demoted one loses it
        if (msg.role === 'host') {
          send(target.ws, { t: 'term_open', allowInput: session.term.allowInput });
        } else {
          send(target.ws, { t: 'term_close' });
        }
      }
      broadcastPeers(session);
      break;
    }

    default:
      fail(ws, 'unknown type');
  }
}

function cleanup(ws) {
  const session = sessions.get(ws.code);
  if (!session) return;
  if (ws === session.host) {
    for (const peer of session.peers) send(peer.ws, { t: 'ended' });
    for (const p of session.pending) send(p.ws, { t: 'ended' });
    clearSession(ws.code);
    sessions.delete(ws.code);
  } else {
    const wasPeer = session.peers.some((p) => p.ws === ws);
    const wasPending = session.pending.some((p) => p.ws === ws);
    session.pending = session.pending.filter((p) => p.ws !== ws);
    session.peers = session.peers.filter((p) => p.ws !== ws);
    if (wasPeer) {
      sendToAll(session, { t: 'cursor_gone', name: ws.name });
      sendToAll(session, { t: 'left', name: ws.name });
      broadcastPeers(session);
    } else if (wasPending) {
      send(session.host, { t: 'left', name: ws.name, pending: true });
    }
  }
}

// ---------- connections ----------

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.ip = req.socket.remoteAddress;
  ws.windowStart = Date.now();
  ws.msgCount = 0;

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', (err) => console.log('socket error:', err.message));
  ws.on('message', (data) => {
    try {
      handle(ws, data);
    } catch (err) {
      console.error('handler error:', err);
    }
  });
  ws.on('close', () => {
    try {
      cleanup(ws);
    } catch (err) {
      console.error('cleanup error:', err);
    }
  });
});

// Heartbeat: a connection that stops answering (Wi-Fi dropped) is closed,
// which ends the session for everyone else instead of leaving it hanging.
// It also clears old wrong-code records so the map does not grow forever.
const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of badByIp) {
    if (now > rec.resetAt) badByIp.delete(ip);
  }
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(heartbeat));
wss.on('error', (err) => console.error('server error:', err.message));

// Last safety net: log and keep running
process.on('uncaughtException', (err) => console.error('uncaught:', err));
process.on('unhandledRejection', (err) => console.error('unhandled rejection:', err));
