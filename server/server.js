'use strict';
const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 8080 });
console.log('Server running on ws://localhost:8080');

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
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

      default:
        send(ws, { t: 'error', msg: 'unknown type' });
    }
  });
});
