'use strict';
// End-to-end test for the shared terminal and the permission fixes.
// Start the server first (npm start), then run: node test-terminal.js
const { spawn } = require('child_process');
const WebSocket = require('ws');
const assert = require('assert');

const URL = process.env.URL || 'ws://127.0.0.1:8080';

async function startServerIfNeeded() {
  try {
    const ws = new WebSocket(URL);
    await new Promise((resolve, reject) => {
      ws.on('open', () => { ws.close(); resolve(); });
      ws.on('error', reject);
    });
    return null;
  } catch {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: '8080' },
      stdio: 'ignore',
    });
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        const ws = new WebSocket(URL);
        await new Promise((resolve, reject) => {
          ws.on('open', () => { ws.close(); resolve(); });
          ws.on('error', reject);
        });
        return child;
      } catch {}
    }
    throw new Error('Server failed to start on ' + URL);
  }
}

function client() {
  const ws = new WebSocket(URL);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    const i = waiters.findIndex((w) => w.test(m));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
    else inbox.push(m);
  });
  return {
    ws,
    open: () => new Promise((r) => ws.on('open', r)),
    send: (o) => ws.send(JSON.stringify(o)),
    next(test, label, ms = 1500) {
      const t = typeof test === 'string' ? (m) => m.t === test : test;
      const i = inbox.findIndex(t);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { test: t, resolve };
        waiters.push(w);
        setTimeout(() => {
          const k = waiters.indexOf(w);
          if (k >= 0) { waiters.splice(k, 1); reject(new Error('timeout waiting for ' + (label || test))); }
        }, ms);
      });
    },
    // true when nothing matching arrives within a short time
    async never(test, ms = 300) {
      const t = typeof test === 'string' ? (m) => m.t === test : test;
      try { await this.next(t, 'never', ms); return false; } catch { return true; }
    },
  };
}

async function main() {
  const serverProcess = await startServerIfNeeded();
  const host = client(), alice = client(), bob = client(), carol = client();
  await Promise.all([host.open(), alice.open(), bob.open(), carol.open()]);

  host.send({ t: 'create', name: 'Owner' });
  const { code } = await host.next('created');

  for (const [c, name] of [[alice, 'Alice'], [bob, 'Bob'], [carol, 'Carol']]) {
    c.send({ t: 'join', code, name });
    await host.next((m) => m.t === 'join_request' && m.name === name);
    host.send({ t: 'decide', name, approve: true });
    const joined = await c.next('joined');
    assert.strictEqual(typeof joined.masked, 'number', 'joined carries the masked count');
  }
  console.log('PASS 1: three guests joined, "joined" includes masked count');

  host.send({ t: 'role', name: 'Alice', role: 'host' });
  await alice.next('role');

  // a promoted host cannot approve a waiting guest, only the superhost can
  const dave = client(); await dave.open();
  dave.send({ t: 'join', code, name: 'Dave' });
  await host.next((m) => m.t === 'join_request' && m.name === 'Dave');
  alice.send({ t: 'decide', name: 'Dave', approve: true });
  assert.ok(await dave.never('joined'), 'a host must not approve joins');
  host.send({ t: 'decide', name: 'Dave', approve: false });
  await dave.next('denied');
  console.log('PASS 2: only the superhost can decide join requests');

  // terminal: open
  host.send({ t: 'term_open' });
  const opened = await alice.next('term_open');
  assert.strictEqual(opened.allowInput, false);
  assert.ok(await bob.never('term_open') && await carol.never('term_open'), 'guests must not get term_open');
  console.log('PASS 3: term_open reaches the host, not the guests');

  // terminal: data
  host.send({ t: 'term_data', data: 'hello\r\n' });
  assert.strictEqual((await alice.next('term_data')).data, 'hello\r\n');
  assert.ok(await bob.never('term_data'), 'guests must not get term_data');
  console.log('PASS 4: term_data reaches the host only');

  // guests and hosts cannot push output or open terminals
  bob.send({ t: 'term_data', data: 'fake' });
  alice.send({ t: 'term_open' });
  await alice.next((m) => m.t === 'error');
  assert.ok(await alice.never('term_data') && await host.never('term_data'));
  console.log('PASS 5: only the superhost can send terminal output or open a terminal');

  // input off by default
  alice.send({ t: 'term_input', data: 'ls' });
  await alice.next((m) => m.t === 'error' && /switched off/.test(m.msg));
  assert.ok(await host.never('term_input'));
  console.log('PASS 6: host typing is rejected while switched off');

  // input on
  host.send({ t: 'term_allow_input', allow: true });
  assert.strictEqual((await alice.next('term_allow_input')).allow, true);
  alice.send({ t: 'term_input', data: 'ls' });
  const inp = await host.next('term_input');
  assert.strictEqual(inp.name, 'Alice');
  assert.strictEqual(inp.data, 'ls');
  console.log('PASS 7: host typing reaches the superhost with the server-set name');

  // guests can never type; oversize lines are dropped
  bob.send({ t: 'term_input', data: 'rm -rf /' });
  await bob.next((m) => m.t === 'error');
  alice.send({ t: 'term_input', data: 'x'.repeat(5000) });
  assert.ok(await host.never('term_input'));
  console.log('PASS 8: guests cannot type, oversize lines dropped');

  // demote closes the terminal for that person, promote opens it
  host.send({ t: 'role', name: 'Alice', role: 'guest' });
  await alice.next('term_close');
  host.send({ t: 'role', name: 'Bob', role: 'host' });
  const bobOpen = await bob.next('term_open');
  assert.strictEqual(bobOpen.allowInput, true);
  console.log('PASS 9: demote closes, promote opens the terminal');

  // revoking a host's edit access is refused (use role change)
  host.send({ t: 'revoke_edit', name: 'Bob' });
  await host.next((m) => m.t === 'error' && /host/.test(m.msg));
  console.log('PASS 10: revoke_edit on a host is refused');

  // close
  host.send({ t: 'term_close' });
  await bob.next('term_close');
  host.send({ t: 'term_data', data: 'late' });
  assert.ok(await bob.never('term_data'));
  console.log('PASS 11: term_close stops the stream');

  // refusal errors are marked fatal, others are not
  const x = client(); await x.open();
  x.send({ t: 'join', code: 'ZZZZZZ', name: 'X' });
  assert.strictEqual((await x.next('error')).fatal, true);
  console.log('PASS 12: refused join is marked fatal');

  const y = client(); await y.open();
  y.send({ t: 'join', code, name: 'Alice' }); // name taken
  assert.strictEqual((await y.next('error')).fatal, true);
  carol.send({ t: 'bogus' });
  assert.strictEqual((await carol.next('error')).fatal, undefined);
  console.log('PASS 13: ordinary errors are not fatal');

    console.log('\n✓ ALL TERMINAL AND PERMISSION TESTS PASS');
  for (const c of [host, alice, bob, carol, x, y]) c.ws.close();
  if (serverProcess) serverProcess.kill();
  process.exit(0);
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
