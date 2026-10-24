'use strict';
const WebSocket = require('ws');

function connect() {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:8080');
    ws.on('open', () => resolve(ws));
  });
}

function nextMsg(ws) {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data)));
  });
}

function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

async function run() {
  let pass = true;
  const errors = [];

  const host = await connect();
  const guest = await connect();

  // Host creates session
  send(host, { t: 'create' });
  const created = await nextMsg(host);
  if (created.t !== 'created' || !created.code) {
    errors.push('create failed: ' + JSON.stringify(created));
    pass = false;
  }
  const code = created.code;

  // Guest joins
  send(guest, { t: 'join', code, name: 'Alice' });
  const joinReq = await nextMsg(host);
  if (joinReq.t !== 'join_request' || joinReq.name !== 'Alice') {
    errors.push('join_request failed: ' + JSON.stringify(joinReq));
    pass = false;
  }

  // Host approves
  send(host, { t: 'decide', name: 'Alice', approve: true });
  const [joinedMsg, peersMsg] = await Promise.all([nextMsg(guest), nextMsg(host)]);
  if (joinedMsg.t !== 'joined') {
    errors.push('joined failed: ' + JSON.stringify(joinedMsg));
    pass = false;
  }
  if (peersMsg.t !== 'peers' || !peersMsg.list.includes('Alice')) {
    errors.push('peers failed: ' + JSON.stringify(peersMsg));
    pass = false;
  }

  // Host sends doc, guest receives it
  send(host, { t: 'doc', text: 'Hello World' });
  const docMsg = await nextMsg(guest);
  if (docMsg.t !== 'doc' || docMsg.text !== 'Hello World') {
    errors.push('doc forward failed: ' + JSON.stringify(docMsg));
    pass = false;
  }

  // Guest tries to send doc - should be blocked (no delivery)
  // We'll send and wait a short time to confirm host does NOT receive it
  send(guest, { t: 'doc', text: 'hack attempt' });
  const noDelivery = await Promise.race([
    nextMsg(host).then(m => ({ got: m })),
    new Promise(r => setTimeout(() => r({ timeout: true }), 500))
  ]);
  if (!noDelivery.timeout) {
    errors.push('guest doc was delivered to host: ' + JSON.stringify(noDelivery.got));
    pass = false;
  }

  host.close();
  guest.close();

  if (errors.length) console.error('Errors:', errors);
  console.log(pass ? 'PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
}

run().catch(err => {
  console.error(err);
  console.log('FAIL');
  process.exit(1);
});
