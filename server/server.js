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

      default:
        send(ws, { t: 'error', msg: 'unknown type' });
    }
  });
});
