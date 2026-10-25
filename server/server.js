'use strict';
const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 8080 });
console.log('Server running on ws://localhost:8080');

const sessions = new Map(); // code -> { host, peers: [], pending: [] }

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function genCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (sessions.has(code));
  return code;
}

const isEditor = (ws) => ws.role === 'superhost' || ws.role === 'host';

// everyone in a session: the superhost plus approved guests
function everyone(session) {
  return [session.host, ...session.peers.map((p) => p.ws)];
}

function sendToAll(session, obj, except) {
  for (const w of everyone(session)) {
    if (w !== except) send(w, obj);
  }
}

// send the participant list (names and roles) to everyone
function broadcastPeers(session) {
  const peers = session.peers.map((p) => ({ name: p.name, role: p.ws.role }));
  sendToAll(session, { t: 'peers', list: peers.map((p) => p.name), peers });
}

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      send(ws, { t: 'error', msg: 'bad json' });
      return;
    }
    console.log('recv:', msg);

    switch (msg.t) {
      case 'ping':
        send(ws, { t: 'pong' });
        break;

      case 'create': {
        const code = genCode();
        sessions.set(code, { host: ws, peers: [], pending: [] });
        ws.role = 'superhost';
        ws.name = msg.name;
        ws.code = code;
        send(ws, { t: 'created', code });
        break;
      }

      case 'join': {
        const session = sessions.get(msg.code);
        if (!session) { send(ws, { t: 'error', msg: 'bad code' }); break; }
        ws.name = msg.name;
        ws.role = 'guest';
        ws.code = msg.code;
        session.pending.push({ ws, name: msg.name });
        send(session.host, { t: 'join_request', name: msg.name });
        break;
      }

      case 'decide': {
        if (!isEditor(ws)) break;
        const session = sessions.get(ws.code);
        if (!session) break;
        const idx = session.pending.findIndex((p) => p.name === msg.name);
        if (idx === -1) break;
        const [guest] = session.pending.splice(idx, 1);
        if (msg.approve) {
          session.peers.push(guest);
          send(guest.ws, { t: 'joined' });
          broadcastPeers(session);
        } else {
          send(guest.ws, { t: 'denied' });
        }
        break;
      }

      case 'doc': {
        if (!isEditor(ws)) { console.log('blocked guest doc'); break; }
        const session = sessions.get(ws.code);
        if (!session) break;
        sendToAll(session, msg, ws);
        break;
      }

      case 'cursor': {
        const session = sessions.get(ws.code);
        if (!session) break;
        // only the superhost and approved guests may send cursors
        const member = ws === session.host || session.peers.some((p) => p.ws === ws);
        if (!member) break;
        if (!Number.isInteger(msg.line) || !Number.isInteger(msg.character)) break;
        sendToAll(session, {
          t: 'cursor',
          name: ws.name,
          line: msg.line,
          character: msg.character,
        }, ws);
        break;
      }

      case 'suggest': {
        // forward to every editor except the sender
        const session = sessions.get(ws.code);
        if (!session) break;
        for (const w of everyone(session)) {
          if (isEditor(w) && w !== ws) send(w, msg);
        }
        break;
      }

      case 'suggest_result': {
        if (!isEditor(ws)) break;
        const session = sessions.get(ws.code);
        if (!session) break;
        sendToAll(session, msg, ws);
        break;
      }

      case 'role': {
        // only the superhost can promote or demote
        if (ws.role !== 'superhost') break;
        const session = sessions.get(ws.code);
        if (!session) break;
        if (msg.role !== 'host' && msg.role !== 'guest') break;
        const target = session.peers.find((p) => p.name === msg.name);
        if (!target) { send(ws, { t: 'error', msg: 'no such person' }); break; }
        target.ws.role = msg.role;
        send(target.ws, { t: 'role', role: msg.role });
        broadcastPeers(session);
        break;
      }

      default:
        send(ws, { t: 'error', msg: 'unknown type' });
    }
  });

  ws.on('close', () => {
    const session = sessions.get(ws.code);
    if (!session) return;
    if (ws.role === 'superhost') {
      for (const peer of session.peers) send(peer.ws, { t: 'ended' });
      for (const p of session.pending) send(p.ws, { t: 'ended' });
      sessions.delete(ws.code);
    } else {
      session.pending = session.pending.filter((p) => p.ws !== ws);
      session.peers = session.peers.filter((p) => p.ws !== ws);
      sendToAll(session, { t: 'cursor_gone', name: ws.name });
      broadcastPeers(session);
    }
  });
});