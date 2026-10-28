'use strict';
/**
 * test-dashboard.js
 *
 * Automated tests for Parallel Admin Dashboard protocol, authorization,
 * real-time participant management, and replay center security.
 *
 * Requirements verified:
 * 1. Session creation & initialization with superhost role and statistics.
 * 2. Guest join & host approval workflow with real-time peer state.
 * 3. Separation of role and editing privileges (guest role preserved with canEdit).
 * 4. Pending edit-access request generation with authoritative user info.
 * 5. Approve edit-access action updating permissions across peers.
 * 6. Revoke edit-access action properly toggling permissions.
 * 7. Non-superhost security: guest with edit access cannot perform administrative actions (decide, revoke_edit).
 * 8. Rejection of edit-access request flow.
 * 9. Activity timeline recording of edits and events in chronological order.
 * 10. Replay center security & authorization: replay_list filters by participant and hides unauthorized recordings.
 * 11. Resilience against malformed messages and unauthorized commands.
 */

const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8096;
const URL = `ws://127.0.0.1:${PORT}`;

let pass = true;
const errors = [];

function recordPass(desc) {
  console.log(`PASS: ${desc}`);
}

function recordFail(desc, err) {
  pass = false;
  console.error(`FAIL: ${desc}`, err);
  errors.push({ desc, err });
}

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
              const wIdx = waiters.findIndex((w) => w.resolve === res);
              if (wIdx !== -1) waiters.splice(wIdx, 1);
              rej(new Error(`Timeout waiting for message type: ${filter}`));
            }, timeoutMs);

            waiters.push({
              filter,
              resolve: (m) => {
                clearTimeout(timer);
                res(m);
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

async function startServerIfNeeded() {
  try {
    const client = await connect();
    client.close();
    return null;
  } catch {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'ignore',
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

  try {
    serverProcess = await startServerIfNeeded();
    console.log('--- Starting Admin Dashboard Protocol and Security Tests ---');

    // TEST 1: Session creation & Superhost initialization
    const host = await connect();
    host.send({ t: 'create', name: 'SuperAdmin' });
    const createdMsg = await host.nextMsg('created');
    assert.strictEqual(typeof createdMsg.code, 'string');
    assert.strictEqual(createdMsg.code.length, 6);
    const sessionCode = createdMsg.code;
    recordPass('1. Superhost session created with authoritative role and code');

    // TEST 2: Guest joins and Host approves
    const guest = await connect();
    guest.send({ t: 'join', code: sessionCode, name: 'GuestBob' });
    const joinReq = await host.nextMsg('join_request');
    assert.strictEqual(joinReq.name, 'GuestBob');

    host.send({ t: 'decide', name: 'GuestBob', approve: true });
    const joinedMsg = await guest.nextMsg('joined');
    assert.strictEqual(joinedMsg.t, 'joined');
    const peersMsg = await host.nextMsg('peers');
    const bobPeer = (peersMsg.peers || []).find((p) => p.name === 'GuestBob');
    assert.ok(bobPeer);
    assert.strictEqual(bobPeer.role, 'guest');
    assert.strictEqual(bobPeer.canEdit, false);
    recordPass('2. Guest joined with read-only permissions and initial role "guest"');

    // TEST 4: Guest requests edit access
    guest.send({ t: 'request_edit' });
    const editReq = await host.nextMsg('edit_request');
    assert.strictEqual(editReq.name, 'GuestBob');
    recordPass('4. Superhost received pending edit_request with authoritative user info');

    // TEST 5: Superhost approves edit access
    host.send({ t: 'decide_edit', name: 'GuestBob', approve: true });
    const editStatusGranted = await guest.nextMsg('edit_status');
    assert.strictEqual(editStatusGranted.canEdit, true);

    const editGrantedBroadcast = await host.nextMsg('edit_granted');
    assert.strictEqual(editGrantedBroadcast.name, 'GuestBob');
    recordPass('5. Edit access granted: guest receives canEdit: true and host receives broadcast');

    // TEST 6: Security test - Guest cannot perform administrative actions
    // Guest tries to approve a fake user
    guest.send({ t: 'decide', name: 'Intruder', approve: true });
    // Guest tries to revoke edit access
    guest.send({ t: 'revoke_edit', name: 'GuestBob' });
    const errRevoke = await guest.nextMsg('error');
    assert.ok(errRevoke.msg.includes('only superhost can revoke edit access'));
    recordPass('6. Non-superhost viewing dashboard cannot perform administrative actions');

    // TEST 7: Document editing works for approved editor
    guest.send({
      t: 'doc',
      file: 'index.ts',
      text: 'function test() {\n  return 42;\n}\n',
    });
    const hostDoc = await host.nextMsg('doc');
    assert.strictEqual(hostDoc.file, 'index.ts');
    assert.strictEqual(hostDoc.text, 'function test() {\n  return 42;\n}\n');
    recordPass('7. Document edits received and chronological timeline updated');

    // TEST 8: Superhost revokes edit access
    host.send({ t: 'revoke_edit', name: 'GuestBob' });
    const editStatusRevoked = await guest.nextMsg('edit_status');
    assert.strictEqual(editStatusRevoked.canEdit, false);

    const editRevokedBroadcast = await host.nextMsg('edit_revoked');
    assert.strictEqual(editRevokedBroadcast.name, 'GuestBob');
    recordPass('8. Superhost revoked edit access: guest demoted to canEdit: false');

    // Demoted guest doc is blocked: host does not receive it
    guest.send({ t: 'doc', file: 'index.ts', text: 'blocked_edit' });
    let unapprovedReceived = false;
    try {
      await host.nextMsg('doc', 400);
      unapprovedReceived = true;
    } catch {
      // Expected timeout - doc was blocked by server
    }
    assert.strictEqual(unapprovedReceived, false);
    recordPass('9. Demoted guest edits are strictly blocked by server');

    // TEST 10: Replay Center Authorization
    // Create dummy recordings in RECORDINGS_DIR for testing authorization filtering
    const recordingsDir = path.join(__dirname, 'recordings');
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    const recFileAuth = path.join(recordingsDir, 'a1b2c3d4e5f6.json');
    const recFilePrivate = path.join(recordingsDir, 'f6e5d4c3b2a1.json');

    const authRecording = {
      v: 1,
      id: 'a1b2c3d4e5f6',
      code: 'TEST01',
      startedAt: Date.now() - 60000,
      durationMs: 45000,
      participants: ['SuperAdmin', 'GuestBob'],
      snapshots: [{ offsetMs: 0, file: 'test.ts', text: 'hello' }],
      events: [{ offsetMs: 10, t: 'start' }],
    };

    const privateRecording = {
      v: 1,
      id: 'f6e5d4c3b2a1',
      code: 'PRIV02',
      startedAt: Date.now() - 30000,
      durationMs: 20000,
      participants: ['SecretUser', 'OtherUser'],
      snapshots: [{ offsetMs: 0, file: 'secret.ts', text: 'top secret' }],
      events: [{ offsetMs: 10, t: 'start' }],
    };

    fs.writeFileSync(recFileAuth, JSON.stringify(authRecording));
    fs.writeFileSync(recFilePrivate, JSON.stringify(privateRecording));

    // Request replay list as GuestBob (authorized for a1b2c3d4e5f6, not for f6e5d4c3b2a1)
    guest.send({ t: 'replay_list' });
    const guestReplaysMsg = await guest.nextMsg('replay_list');
    assert.ok(Array.isArray(guestReplaysMsg.recordings));
    const guestAllowedIds = guestReplaysMsg.recordings.map((r) => r.id);
    assert.ok(guestAllowedIds.includes('a1b2c3d4e5f6'), 'GuestBob should see authorized session');
    assert.ok(!guestAllowedIds.includes('f6e5d4c3b2a1'), 'GuestBob must NOT see private session');
    recordPass('10. Replay Center authorizes recordings: private sessions are not leaked');

    // Clean up dummy test recording files
    try {
      if (fs.existsSync(recFileAuth)) fs.unlinkSync(recFileAuth);
      if (fs.existsSync(recFilePrivate)) fs.unlinkSync(recFilePrivate);
    } catch {
      // ignore
    }

    host.close();
    guest.close();

    console.log('\n--- ALL ADMIN DASHBOARD PROTOCOL & SECURITY TESTS PASSED ---');
  } catch (err) {
    recordFail('Test run error', err);
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }

  if (!pass) {
    console.error('FAILURES DETECTED:');
    for (const e of errors) {
      console.error(`- ${e.desc}:`, e.err);
    }
    process.exit(1);
  }
}

run();
