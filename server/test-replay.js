'use strict';

const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 8098;
const URL = `ws://127.0.0.1:${PORT}`;

const fakeAwsKey = ['AKIA', '9876', '5432', '10FE', 'DCBA'].join('');

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
      stdio: ['ignore', 'ignore', 'inherit'],
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
    host.send({ t: 'create', name: 'HostAlice' });
    const created = await host.nextMsg('created');
    assert.strictEqual(created.t, 'created');
    const code = created.code;
    assert.ok(code && code.length === 6, 'Code must be 6 characters');

    // 2. Guest joins
    guest.send({ t: 'join', code, name: 'GuestBob' });
    const joinReq = await host.nextMsg('join_request');
    assert.strictEqual(joinReq.name, 'GuestBob');

    // 3. Host approves
    host.send({ t: 'decide', name: 'GuestBob', approve: true });
    const joined = await guest.nextMsg('joined');
    assert.strictEqual(joined.t, 'joined');

    // 4. Host sends doc updates (one containing fake AWS key AKIA + 16 characters)
    host.send({ t: 'doc', text: 'function hello() {\n  return 1;\n}', file: 'index.js' });
    const doc1 = await guest.nextMsg('doc');
    assert.strictEqual(doc1.t, 'doc');

    const docTextWithKey = `const AWS_KEY = "${fakeAwsKey}";\nfunction hello() {\n  return 1;\n}`;
    host.send({ t: 'doc', text: docTextWithKey, file: 'index.js' });
    const doc2 = await guest.nextMsg('doc');
    assert.strictEqual(doc2.t, 'doc');

    // 5. Guest suggests
    guest.send({
      t: 'suggest',
      id: 'sug-101',
      line: 1,
      text: '// Updated AWS comment',
    });
    const sugOnHost = await host.nextMsg('suggest');
    assert.strictEqual(sugOnHost.from, 'GuestBob');

    // Host accepts suggestion
    host.send({
      t: 'suggest_result',
      sid: 'sug-101',
      status: 'accepted',
      accept: true,
    });
    await guest.nextMsg('suggest_result');

    // 6. Unauthorized guest tries to end session -> rejected
    guest.send({ t: 'end_session' });
    const unauthEndErr = await guest.nextMsg('error');
    assert.strictEqual(unauthEndErr.msg, 'only superhost can end session', 'Guest cannot end session');

    // 7. Host ends session gracefully via end_session
    host.send({ t: 'end_session' });

    // Host (socket still open) receives replay_ready, summary, and ended
    const hostReadyMsg = await host.nextMsg('replay_ready');
    assert.strictEqual(hostReadyMsg.t, 'replay_ready');
    assert.ok(hostReadyMsg.id, 'Host replay_ready must contain id');
    const replayId = hostReadyMsg.id;
    assert.match(replayId, /^[a-f0-9]{12}$/, 'Replay id must be 12-char hex string');
    assert.strictEqual(hostReadyMsg.code, code, 'replay_ready must include session code');

    const hostSummaryMsg = await host.nextMsg('summary');
    assert.strictEqual(hostSummaryMsg.t, 'summary');
    assert.strictEqual(hostSummaryMsg.edits, 2);

    const hostEndedMsg = await host.nextMsg('ended');
    assert.strictEqual(hostEndedMsg.t, 'ended');

    // Guest also receives replay_ready, summary, and ended
    const guestReadyMsg = await guest.nextMsg('replay_ready');
    assert.strictEqual(guestReadyMsg.t, 'replay_ready');
    assert.strictEqual(guestReadyMsg.id, replayId);
    assert.strictEqual(guestReadyMsg.code, code);

    const guestSummaryMsg = await guest.nextMsg('summary');
    assert.strictEqual(guestSummaryMsg.t, 'summary');
    assert.strictEqual(guestSummaryMsg.edits, 2, 'Summary edits count must be 2');
    assert.strictEqual(guestSummaryMsg.suggested, 1, 'Summary suggested count must be 1');
    assert.strictEqual(guestSummaryMsg.accepted, 1, 'Summary accepted count must be 1');
    assert.ok(guestSummaryMsg.participants.includes('HostAlice'), 'Summary contains HostAlice');
    assert.ok(guestSummaryMsg.participants.includes('GuestBob'), 'Summary contains GuestBob');

    const guestEndedMsg = await guest.nextMsg('ended');
    assert.strictEqual(guestEndedMsg.t, 'ended');

    // Host disconnects cleanly now that session has ended
    host.close();

    // 8. Asserts: replay_get returns the events in order, with increasing offsets
    guest.send({ t: 'replay_get', id: replayId });
    const replayMsg = await guest.nextMsg('replay');
    assert.strictEqual(replayMsg.t, 'replay');
    const data = replayMsg.data;
    assert.ok(data, 'Replay data must be present');
    assert.strictEqual(data.v, 1, 'Version must be 1');
    assert.strictEqual(data.id, replayId);
    assert.strictEqual(data.code, code);

    assert.ok(Array.isArray(data.events), 'Events must be an array');
    for (let i = 1; i < data.events.length; i++) {
      assert.ok(
        data.events[i].at >= data.events[i - 1].at,
        `Event offsets must be monotonically increasing (at index ${i}: ${data.events[i].at} < ${data.events[i - 1].at})`
      );
    }

    // 9. Asserts: Recording contains NO raw fake key; the snapshot has the masked placeholder instead
    const serialized = JSON.stringify(data);
    assert.ok(!serialized.includes(fakeAwsKey), 'Recording must contain NO raw fake AWS key');
    assert.ok(Array.isArray(data.snapshots) && data.snapshots.length === 2, 'Must have 2 snapshots');
    const lastSnapshot = data.snapshots[1];
    assert.ok(lastSnapshot.text.includes('•'), 'Snapshot must contain masked bullet placeholder');
    assert.ok(lastSnapshot.text.includes('const AWS_KEY = "••••••••••••••••••••"'), 'AWS key is masked');

    // 10. Asserts: Non-member client requesting replay gets an error
    const nonMember = await connect();
    nonMember.send({ t: 'replay_get', id: replayId });
    const nonMemberErr = await nonMember.nextMsg('error');
    assert.strictEqual(nonMemberErr.msg, 'no replay', 'Non-member must get "no replay" error');
    nonMember.close();

    // 11. Asserts: Malformed id (e.g. "../x") is rejected
    guest.send({ t: 'replay_get', id: '../x' });
    const malformedErr = await guest.nextMsg('error');
    assert.strictEqual(malformedErr.msg, 'no replay', 'Malformed replay id must get "no replay" error');

    // 12. Asserts: Summary counts match (edits, suggestions, participants)
    assert.strictEqual(data.snapshots.length, 2, 'Snapshot edits match');
    assert.strictEqual(data.participants.length, 2, 'Participants match');
    assert.ok(data.participants.includes('HostAlice'));
    assert.ok(data.participants.includes('GuestBob'));

    // 13. Asserts: Latest replay request (no id / id: 'last')
    // Unauthorized client requesting latest replay
    const unauthClient = await connect();
    unauthClient.send({ t: 'replay_get', id: 'last', name: 'UnknownUser' });
    const unauthErr = await unauthClient.nextMsg('error');
    assert.strictEqual(unauthErr.msg, 'no replay', 'Unauthorized latest replay request must be rejected');
    unauthClient.close();

    // Authorized participant requesting latest replay
    const authClient = await connect();
    authClient.send({ t: 'replay_get', id: 'last', name: 'HostAlice' });
    const latestMsg = await authClient.nextMsg('replay');
    assert.strictEqual(latestMsg.t, 'replay');
    assert.strictEqual(latestMsg.data.id, replayId, 'Latest replay must match most recent session id');
    assert.strictEqual(latestMsg.data.code, code);
    authClient.close();

    // 14. Asserts: Retrieve by session code
    const byCodeClient = await connect();
    byCodeClient.send({ t: 'replay_get', id: code, name: 'GuestBob' });
    const codeMsg = await byCodeClient.nextMsg('replay');
    assert.strictEqual(codeMsg.t, 'replay');
    assert.strictEqual(codeMsg.data.id, replayId, 'Retrieval by 6-char session code works');
    assert.strictEqual(codeMsg.data.code, code);

    // Non-existent session code
    byCodeClient.send({ t: 'replay_get', id: 'NOCODE', name: 'GuestBob' });
    const noCodeErr = await byCodeClient.nextMsg('error');
    assert.strictEqual(noCodeErr.msg, 'no replay', 'Non-existent session code returns no replay');
    byCodeClient.close();

    // 15. Asserts: Empty session test (session with no edits)
    const emptyHost = await connect();
    emptyHost.send({ t: 'create', name: 'EmptyHost' });
    const emptyCreated = await emptyHost.nextMsg('created');
    const emptyCode = emptyCreated.code;

    // Host ends session immediately without any edits
    emptyHost.send({ t: 'end_session' });
    const emptyReady = await emptyHost.nextMsg('replay_ready');
    assert.ok(emptyReady.id, 'Empty session has replay id');
    const emptySummary = await emptyHost.nextMsg('summary');
    assert.strictEqual(emptySummary.edits, 0, 'Empty session has 0 edits');
    await emptyHost.nextMsg('ended');
    emptyHost.close();

    // Retrieve empty session replay
    const emptyRetrieveClient = await connect();
    emptyRetrieveClient.send({ t: 'replay_get', id: emptyReady.id, name: 'EmptyHost' });
    const emptyReplayMsg = await emptyRetrieveClient.nextMsg('replay');
    assert.strictEqual(emptyReplayMsg.t, 'replay');
    assert.strictEqual(emptyReplayMsg.data.id, emptyReady.id);
    assert.strictEqual(emptyReplayMsg.data.code, emptyCode);
    assert.strictEqual(emptyReplayMsg.data.snapshots.length, 0, 'Empty session has 0 snapshots in data');
    emptyRetrieveClient.close();

    // 16. Asserts: Empty and malformed file resilience
    const recDir = path.join(__dirname, 'recordings');
    const emptyPath = path.join(recDir, '000000000000.json');
    const malformedPath = path.join(recDir, '111111111111.json');
    fs.writeFileSync(emptyPath, '', 'utf8');
    fs.writeFileSync(malformedPath, '{ broken json', 'utf8');

    try {
      const authClient2 = await connect();
      authClient2.send({ t: 'replay_get', name: 'GuestBob' });
      const resilientMsg = await authClient2.nextMsg('replay');
      assert.strictEqual(resilientMsg.t, 'replay');
      assert.strictEqual(resilientMsg.data.id, replayId, 'Skips corrupt files and returns valid recording');
      authClient2.close();
    } finally {
      try { fs.unlinkSync(emptyPath); } catch {}
      try { fs.unlinkSync(malformedPath); } catch {}
    }

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
