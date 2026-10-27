'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRecorder,
  recordSuggestion,
  recordSuggestionResult,
  getSummary,
} = require('./recorder');

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

  const chunkSize = 190 * 1024;
  const chunkText = 'B'.repeat(chunkSize);

  for (let i = 0; i < 30; i++) {
    const text = chunkText + i;
    rec.addSnapshot(`file_${i}.txt`, text);
  }

  rec.addEvent('custom_event', 'Alice', { idx: 999 });
  rec.finish();

  const json = rec.toJSON();
  assert.equal(json.truncated, true);
  const totalBytes = json.snapshots.reduce((sum, s) => sum + Buffer.byteLength(s.text, 'utf8'), 0);
  assert.ok(totalBytes <= 5 * 1024 * 1024);
  assert.ok(json.events.some((e) => e.type === 'custom_event'));
});

test('finish is idempotent and does not corrupt state', () => {
  const rec = createRecorder('IDEM01');
  rec.addEvent('session_start', 'Host', {});
  rec.addSnapshot('test.txt', 'version 1');

  rec.finish();
  const first = rec.toJSON();

  rec.finish();
  const second = rec.toJSON();

  assert.equal(first.endedAt, second.endedAt);
  assert.equal(first.snapshots.length, second.snapshots.length);
  assert.equal(first.events.length, second.events.length);
});

test('recordSuggestion stores masked preview capped at 200 chars and line range', () => {
  const rec = createRecorder('SUG001');
  const session = { recorder: rec };
  const ws = { name: 'GuestCharlie' };

  // Fake AWS key: AKIA + 16 chars
  const fakeKey = 'AKIA' + 'IOSFODNN7EXAMPLE';
  const longReplacement = `let key = "${fakeKey}"; ` + 'X'.repeat(300);

  recordSuggestion(session, ws, {
    id: 'sug-123',
    range: { startLine: 10, endLine: 12 },
    replacement: longReplacement,
  });

  recordSuggestionResult(session, { sid: 'sug-123', status: 'accepted' }, { name: 'HostAlice' });

  const json = rec.toJSON();
  assert.equal(json.events.length, 2);

  const sugEvent = json.events[0];
  assert.equal(sugEvent.type, 'suggest');
  assert.equal(sugEvent.by, 'GuestCharlie');
  assert.equal(sugEvent.data.guest, 'GuestCharlie');
  assert.equal(sugEvent.data.id, 'sug-123');
  assert.deepEqual(sugEvent.data.range, { startLine: 10, endLine: 12 });
  assert.ok(sugEvent.data.preview.length <= 200);
  assert.ok(!sugEvent.data.preview.includes(fakeKey)); // Must be masked!
  assert.ok(sugEvent.data.preview.includes('•'));

  const resultEvent = json.events[1];
  assert.equal(resultEvent.type, 'suggest_accepted');
  assert.equal(resultEvent.by, 'HostAlice');
  assert.equal(resultEvent.data.id, 'sug-123');
});

test('getSummary computes duration, edits, suggested, accepted, rejected, participants', () => {
  const rec = createRecorder('SUM001');
  rec.addEvent('session_start', 'Host', {});
  rec.addEvent('joined', 'Guest1', {});
  rec.addSnapshot('f.js', 'line 1');
  rec.addEvent('suggest', 'Guest1', { id: '1' });
  rec.addEvent('suggest', 'Guest1', { id: '2' });
  rec.addEvent('suggest_accepted', 'Host', { id: '1' });
  rec.addEvent('suggest_rejected', 'Host', { id: '2' });
  rec.finish();

  const summary = getSummary(rec);
  assert.equal(summary.t, 'summary');
  assert.ok(summary.duration >= 0);
  assert.equal(summary.edits, 1);
  assert.equal(summary.suggested, 2);
  assert.equal(summary.accepted, 1);
  assert.equal(summary.rejected, 1);
  assert.deepEqual(summary.participants, ['Host', 'Guest1']);
});
