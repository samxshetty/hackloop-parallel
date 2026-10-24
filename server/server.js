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
        ws.role = 'host';
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
        if (ws.role !== 'host') break;
        const session = sessions.get(ws.code);
        if (!session) break;
        const idx = session.pending.findIndex(p => p.name === msg.name);
        if (idx === -1) break;
        const [guest] = session.pending.splice(idx, 1);
        if (msg.approve) {
          session.peers.push(guest);
          send(guest.ws, { t: 'joined' });
          send(ws, { t: 'peers', list: session.peers.map(p => p.name) });
        } else {
          send(guest.ws, { t: 'denied' });
        }
        break;
      }

      case 'doc': {
        if (ws.role === 'host') {
          const session = sessions.get(ws.code);
          if (!session) break;
          for (const peer of session.peers) {
            send(peer.ws, msg);
          }
        } else {
          console.log('blocked guest doc');
        }
        break;
      }

      case 'suggest': {
        // host or guest: forward to host only
        const session = sessions.get(ws.code);
        if (!session) break;
        send(session.host, msg);
        break;
      }

      case 'suggest_result': {
        // host -> all peers
        if (ws.role !== 'host') break;
        const session = sessions.get(ws.code);
        if (!session) break;
        for (const peer of session.peers) {
          send(peer.ws, msg);
        }
        break;
      }

      default:
        send(ws, { t: 'error', msg: 'unknown type' });
    }
  });
});
