'use strict';

const assert = require('node:assert');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const PORT = 8099;
const URL = `ws://localhost:${PORT}`;

// Build fake keys from string parts so no real-looking secret is stored in the repo
const fakeAwsKey = ['AKIA', '1234', '5678', '90AB', 'CDEF'].join('');
const testDocText = [
  'const awsKey = "' + fakeAwsKey + '";',
  'const other = "line2";',
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
        nextMsg(filter, timeoutMs = 4000) {
          const idx = queue.findIndex((m) => !filter || m.t === filter);
          if (idx !== -1) {
            return Promise.resolve(queue.splice(idx, 1)[0]);
          }
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              rej(new Error(`Timeout waiting for message type "${filter}"`));
            }, timeoutMs);
            waiters.push({
              filter,
              resolve: (val) => {
                clearTimeout(timer);
                res(val);
              },
            });
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

async function expectNoMsg(client, filter, waitMs = 400) {
  try {
    const got = await client.nextMsg(filter, waitMs);
    assert.fail(`Expected no "${filter}" message, but got: ${JSON.stringify(got)}`);
  } catch (err) {
    if (err.message && err.message.startsWith('Timeout waiting for message type')) {
      return; // expected timeout
    }
    throw err;
  }
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
    const guest = await connect();

    // 1. Host creates session
    host.send({ t: 'create', name: 'Host' });
    const created = await host.nextMsg('created');
    assert.strictEqual(created.t, 'created');
    const code = created.code;
    assert.ok(code && code.length === 6);

    // 2. Guest joins
    guest.send({ t: 'join', code, name: 'Alice' });
    const joinReq = await host.nextMsg('join_request');
    assert.strictEqual(joinReq.name, 'Alice');

    // 3. Host approves Guest
    host.send({ t: 'decide', name: 'Alice', approve: true });
    const joined = await guest.nextMsg('joined');
    assert.strictEqual(joined.t, 'joined');

    // 4. Host shares text with fake AWS key
    host.send({ t: 'doc', text: testDocText, file: 'config.ts' });

    // 5. Guest receives masked text
    const doc1 = await guest.nextMsg('doc');
    assert.strictEqual(doc1.t, 'doc');
    assert.strictEqual(doc1.text.length, testDocText.length, 'Length must be preserved exactly');
    assert.ok(!doc1.text.includes(fakeAwsKey), 'Guest must not receive fake AWS key');
    assert.ok(doc1.text.includes('•'), 'Guest must receive bullets for secret');

    // Host receives masked notification
    const maskedMsg = await host.nextMsg('masked');
    assert.strictEqual(maskedMsg.t, 'masked');
    assert.strictEqual(maskedMsg.count, 1);

    // 6. Guest requests edit access
    guest.send({ t: 'request_edit' });
    const editReq = await host.nextMsg('edit_request');
    assert.strictEqual(editReq.name, 'Alice');

    // 7. Host approves edit access
    host.send({ t: 'decide_edit', name: 'Alice', approve: true });
    const editStatus = await guest.nextMsg('edit_status');
    assert.strictEqual(editStatus.canEdit, true);

    // 8. Guest edits another line -> host copy keeps real key and gets edit
    const guestMaskedDoc = doc1.text;
    const guestValidEdit = guestMaskedDoc.replace('"line2"', '"updated_line2"');
    guest.send({ t: 'doc', text: guestValidEdit, file: 'config.ts' });

    const hostDoc = await host.nextMsg('doc');
    assert.ok(hostDoc.text.includes(fakeAwsKey), 'Host must keep the real AWS key');
    assert.ok(hostDoc.text.includes('"updated_line2"'), 'Host must get the guest edit');

    // 9. Host receives { t: 'credit' } with guest listed
    const creditMsg1 = await host.nextMsg('credit');
    assert.strictEqual(creditMsg1.t, 'credit');
    assert.ok(Array.isArray(creditMsg1.list));
    const aliceCredit = creditMsg1.list.find((c) => c.name === 'Alice');
    assert.ok(aliceCredit, 'Alice must be in credit list');
    assert.strictEqual(aliceCredit.revoked, false);
    assert.ok(aliceCredit.edits >= 1);

    // 10. Guest edits masked key -> rejected
    const guestBadEdit = guestMaskedDoc.replace('•', 'X');
    guest.send({ t: 'doc', text: guestBadEdit, file: 'config.ts' });

    const errMsg = await guest.nextMsg('error');
    assert.strictEqual(errMsg.t, 'error');
    assert.ok(errMsg.msg.includes('hidden') || errMsg.msg.includes("can't be edited"));

    // Guest receives resynced doc with last masked text
    const guestResync = await guest.nextMsg('doc');
    assert.strictEqual(guestResync.t, 'doc');

    // Host should NOT receive any doc containing 'X'
    await expectNoMsg(host, 'doc', 400);

    // 11. Revoke edit access
    host.send({ t: 'revoke_edit', name: 'Alice' });
    const revokedStatus = await guest.nextMsg('edit_status');
    assert.strictEqual(revokedStatus.canEdit, false);

    // After revoke, host receives updated credit with revoked: true
    const creditMsg2 = await host.nextMsg('credit');
    const aliceRevoked = creditMsg2.list.find((c) => c.name === 'Alice');
    assert.ok(aliceRevoked, 'Alice must remain in credit list after revoke');
    assert.strictEqual(aliceRevoked.revoked, true);

    // 12. After revoke, guest edit is rejected (blocked)
    guest.send({ t: 'doc', text: guestMaskedDoc + '\n// extra line' });
    await expectNoMsg(host, 'doc', 400);

    host.close();
    guest.close();
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
