'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecorder } = require('./recorder');

test('JSON shape v:1 and initialization', () => {
  const rec = createRecorder('ABC123');
  assert.equal(typeof rec.id, 'string');
  assert.match(rec.id, /^[a-f0-9]{12}$/);
  assert.equal(rec.code, 'ABC123');

  const json = rec.toJSON();
  assert.equal(json.v, 1);
  assert.equal(json.id, rec.id);
  assert.equal(json.code, 'ABC123');
  assert.equal(typeof json.startedAt, 'number');
  assert.equal(typeof json.endedAt, 'number');
  assert.ok(Array.isArray(json.participants));
  assert.ok(Array.isArray(json.events));
  assert.ok(Array.isArray(json.snapshots));
});

test('event and snapshot ordering and non-negative offsets', async () => {
  const rec = createRecorder('ORD001');
  rec.addEvent('session_start', 'Alice', { role: 'superhost' });
  rec.addSnapshot('app.js', 'const x = 1;');

  await new Promise((r) => setTimeout(r, 20));
  rec.addEvent('join_request', 'Bob', {});

  await new Promise((r) => setTimeout(r, 20));
  rec.addEvent('joined', 'Bob', { role: 'guest' });

  rec.finish();
  const json = rec.toJSON();

  assert.equal(json.events.length, 3);
  assert.ok(json.events[0].at <= json.events[1].at);
  assert.ok(json.events[1].at <= json.events[2].at);
  assert.ok(json.events[0].at >= 0);

  assert.equal(json.snapshots.length, 1);
  assert.ok(json.snapshots[0].at >= 0);
  assert.equal(json.snapshots[0].file, 'app.js');
  assert.equal(json.snapshots[0].text, 'const x = 1;');

  assert.deepEqual(json.participants, ['Alice', 'Bob']);
});

test('coalescing and deduplication of snapshots', async () => {
  const rec = createRecorder('COA001');

  // First snapshot committed immediately
  rec.addSnapshot('main.py', 'print("hello")');

  // Duplicate snapshot within min gap - ignored
  rec.addSnapshot('main.py', 'print("hello")');

  // New text within 250ms gap - coalesced into pending
  rec.addSnapshot('main.py', 'print("hello 1")');
  rec.addSnapshot('main.py', 'print("hello 2")');

  // On finish(), the latest pending snapshot must be kept
  rec.finish();
  const json = rec.toJSON();

  assert.equal(json.snapshots.length, 2);
  assert.equal(json.snapshots[0].text, 'print("hello")');
  assert.equal(json.snapshots[1].text, 'print("hello 2")');
});

test('snapshots cap per snapshot (200 KB) and truncation flag', () => {
  const rec = createRecorder('CAP001');
  // Create text larger than 200 KB
  const bigText = 'A'.repeat(250 * 1024);
  rec.addSnapshot('big.txt', bigText);
  rec.finish();

  const json = rec.toJSON();
  assert.equal(json.snapshots.length, 1);
  assert.equal(json.snapshots[0].truncated, true);
  assert.equal(Buffer.byteLength(json.snapshots[0].text, 'utf8'), 200 * 1024);
});

test('total snapshots cap (5 MB) stops snapshots but keeps events', () => {
  const rec = createRecorder('CAP5MB');

  // Add chunks of 190 KB up to 5 MB
  const chunkSize = 190 * 1024;
  const chunkText = 'B'.repeat(chunkSize);

  // Force multiple snapshots beyond 5 MB
  // We can simulate multiple additions by adjusting or adding 28 chunks of 190 KB (~5.3 MB)
  for (let i = 0; i < 30; i++) {
    // Unique text so it doesn't deduplicate
    const text = chunkText + i;
    // We call addSnapshot
    rec.addSnapshot(`file_${i}.txt`, text);
  }

  rec.addEvent('custom_event', 'Alice', { idx: 999 });
  rec.finish();

  const json = rec.toJSON();
  assert.equal(json.truncated, true);
  // Total snapshot bytes must be <= 5 MB
  const totalBytes = json.snapshots.reduce((sum, s) => sum + Buffer.byteLength(s.text, 'utf8'), 0);
  assert.ok(totalBytes <= 5 * 1024 * 1024);
  // Events must still be preserved
  assert.ok(json.events.some((e) => e.type === 'custom_event'));
});

test('finish is idempotent and does not corrupt state', () => {
  const rec = createRecorder('IDEM01');
  rec.addEvent('session_start', 'Host', {});
  rec.addSnapshot('test.txt', 'version 1');

  rec.finish();
  const first = rec.toJSON();

  // Call finish again
  rec.finish();
  const second = rec.toJSON();

  assert.equal(first.endedAt, second.endedAt);
  assert.equal(first.snapshots.length, second.snapshots.length);
  assert.equal(first.events.length, second.events.length);
});
