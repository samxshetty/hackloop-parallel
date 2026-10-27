'use strict';

const assert = require('node:assert');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const PORT = 8099;
const URL = `ws://localhost:${PORT}`;

// Build fake keys from string parts so no real-looking secret is stored in the repo
const fakeAwsKey = ['AKIA', '1234', '5678', '90AB', 'CDEF'].join('');
const fakePassword = ['mySecret', 'Pass12345'].join('');
const testDocText = [
  'const awsKey = "' + fakeAwsKey + '";',
  'const password = "' + fakePassword + '";',
].join('\n');

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.on('open', () => {
      const queue = [];
      const waiters = [];

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          const idx = waiters.findIndex((w) => !w.filter || w.filter === msg.t);
          if (idx !== -1) {
            const waiter = waiters.splice(idx, 1)[0];
            waiter.resolve(msg);
          } else {
            queue.push(msg);
          }
        } catch {
          // ignore malformed
        }
      });

      resolve({
        ws,
        send(obj) {
          ws.send(JSON.stringify(obj));
        },
        nextMsg(filter) {
          const idx = queue.findIndex((m) => !filter || m.t === filter);
          if (idx !== -1) {
            return Promise.resolve(queue.splice(idx, 1)[0]);
          }
          return new Promise((res) => {
            waiters.push({ filter, resolve: res });
          });
        },
        close() {
          ws.close();
        },
      });
    });
    ws.on('error', reject);
  });
}

async function startServerIfNeeded() {
  try {
    const client = await connect();
    client.close();
    return null;
  } catch {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        const client = await connect();
        client.close();
        return child;
      } catch {
        // waiting
      }
    }
    throw new Error('Server failed to start on port ' + PORT);
  }
}

async function run() {
  let serverProcess = null;
  let pass = true;
  const errors = [];

  try {
    serverProcess = await startServerIfNeeded();

    const host = await connect();
    const guest1 = await connect();

    // 1. Host creates session
    host.send({ t: 'create', name: 'Host' });
    const created = await host.nextMsg('created');
    assert.strictEqual(created.t, 'created');
    const code = created.code;
    assert.ok(code && code.length === 6);

    // 2. Guest 1 joins
    guest1.send({ t: 'join', code, name: 'Alice' });
    const joinReq1 = await host.nextMsg('join_request');
    assert.strictEqual(joinReq1.name, 'Alice');

    // 3. Host approves Guest 1
    host.send({ t: 'decide', name: 'Alice', approve: true });
    const joined1 = await guest1.nextMsg('joined');
    assert.strictEqual(joined1.t, 'joined');

    // 4. Host sends text containing fake AWS key and password assignment
    host.send({ t: 'doc', text: testDocText, file: 'config.ts' });

    // 5. Assert Guest 1 receives masked text with bullets of equal length and no raw secret
    const doc1 = await guest1.nextMsg('doc');
    assert.strictEqual(doc1.t, 'doc');
    assert.strictEqual(doc1.text.length, testDocText.length, 'Length must be preserved exactly');
    assert.ok(!doc1.text.includes(fakeAwsKey), 'Guest must not receive fake AWS key');
    assert.ok(!doc1.text.includes(fakePassword), 'Guest must not receive fake password');
    assert.ok(doc1.text.includes('•'), 'Guest must receive bullets for secrets');

    // 6. Assert Host receives { t: 'masked' } with the right count and kinds
    const maskedMsg = await host.nextMsg('masked');
    assert.strictEqual(maskedMsg.t, 'masked');
    assert.strictEqual(maskedMsg.count, 2, 'Must report 2 masked secrets');
    assert.ok(Array.isArray(maskedMsg.kinds));
    assert.ok(maskedMsg.kinds.includes('AWS Access Key'));
    assert.ok(maskedMsg.kinds.includes('Secret Assignment'));

    // 7. Late-joining guest (Guest 2) also gets masked text
    const guest2 = await connect();
    guest2.send({ t: 'join', code, name: 'Bob' });
    const joinReq2 = await host.nextMsg('join_request');
    assert.strictEqual(joinReq2.name, 'Bob');

    host.send({ t: 'decide', name: 'Bob', approve: true });
    const joined2 = await guest2.nextMsg('joined');
    assert.strictEqual(joined2.t, 'joined');

    const doc2 = await guest2.nextMsg('doc');
    assert.strictEqual(doc2.t, 'doc');
    assert.strictEqual(doc2.text.length, testDocText.length, 'Late-joining guest text length preserved');
    assert.ok(!doc2.text.includes(fakeAwsKey), 'Late-joining guest must not receive fake AWS key');
    assert.ok(!doc2.text.includes(fakePassword), 'Late-joining guest must not receive fake password');
    assert.ok(doc2.text.includes('•'), 'Late-joining guest must receive bullets');

    // 8. Guest doc is still ignored (blocked)
    guest1.send({ t: 'doc', text: 'malicious guest update' });
    const hostReceivedDoc = await Promise.race([
      host.nextMsg('doc').then((m) => ({ got: m })),
      new Promise((r) => setTimeout(() => r({ timeout: true }), 400)),
    ]);
    assert.ok(hostReceivedDoc.timeout, 'Guest doc must not be delivered to host');

    host.close();
    guest1.close();
    guest2.close();
  } catch (err) {
    errors.push(err);
    pass = false;
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }

  if (errors.length > 0) {
    console.error('Test errors:', errors);
    console.log('FAIL');
    process.exit(1);
  } else {
    console.log('PASS');
    process.exit(0);
  }
}

run();
