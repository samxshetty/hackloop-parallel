'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { saveRecording, getRecording, getLatestRecording, listRecordings, pruneRecordings } = require('./storage');
const { createRecorder } = require('./recorder');

test('saves recording and retrieves by valid 12-char hex id', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-test-'));
  try {
    const rec = createRecorder('TEST01');
    rec.addEvent('session_start', 'Host', {});
    rec.addSnapshot('file.txt', 'hello world');
    rec.finish();

    const id = saveRecording(rec, tmpDir);
    assert.equal(id, rec.id);
    assert.match(id, /^[a-f0-9]{12}$/);

    const loaded = getRecording(id, tmpDir);
    assert.ok(loaded);
    assert.equal(loaded.v, 1);
    assert.equal(loaded.id, id);
    assert.equal(loaded.code, 'TEST01');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('rejects path traversal and invalid ids', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-test-'));
  try {
    assert.equal(getRecording('../secret', tmpDir), null);
    assert.equal(getRecording('123', tmpDir), null);
    assert.equal(getRecording('xyz', tmpDir), null);
    assert.equal(getRecording('0123456789abcdef', tmpDir), null); // 16 chars instead of 12
    assert.equal(getRecording('../../etc/passwd', tmpDir), null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('prunes files to keep at most newest 20', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-test-'));
  try {
    for (let i = 0; i < 25; i++) {
      const rec = createRecorder(`SES${i}`);
      saveRecording(rec, tmpDir);
    }
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 20);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('getLatestRecording finds most recent valid recording and skips empty or malformed files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-test-'));
  try {
    // 1. Create first recording
    const rec1 = createRecorder('SESS01');
    rec1.addEvent('session_start', 'Alice', {});
    rec1.finish();
    const id1 = saveRecording(rec1, tmpDir);

    // 2. Create second recording slightly later
    const rec2 = createRecorder('SESS02');
    rec2.addEvent('session_start', 'Bob', {});
    rec2.finish();
    const id2 = saveRecording(rec2, tmpDir);

    // 3. Create an empty file with newer mtime
    const emptyFile = path.join(tmpDir, 'ffffffffffff.json');
    fs.writeFileSync(emptyFile, '', 'utf8');

    // 4. Create a malformed file with even newer mtime
    const malformedFile = path.join(tmpDir, 'eeeeeeeeeeee.json');
    fs.writeFileSync(malformedFile, '{ not valid json', 'utf8');

    // 5. Create an incompatible file with newer mtime
    const incompatibleFile = path.join(tmpDir, 'dddddddddddd.json');
    fs.writeFileSync(incompatibleFile, JSON.stringify({ v: 2, id: 'dddddddddddd' }), 'utf8');

    // getLatestRecording should ignore corrupt files and return rec2
    const latest = getLatestRecording(tmpDir);
    assert.ok(latest);
    assert.equal(latest.id, id2);
    assert.equal(latest.code, 'SESS02');

    // With filterFn checking participant
    const forAlice = getLatestRecording(tmpDir, (data) => data.participants?.includes('Alice'));
    assert.ok(forAlice);
    assert.equal(forAlice.id, id1);

    const forNobody = getLatestRecording(tmpDir, (data) => data.participants?.includes('Eve'));
    assert.equal(forNobody, null);

    // getRecording safely returns null for empty and malformed files
    assert.equal(getRecording('ffffffffffff', tmpDir), null);
    assert.equal(getRecording('eeeeeeeeeeee', tmpDir), null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('listRecordings returns summaries of valid files, filters by participant, and ignores corrupted files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-test-'));
  try {
    const rec1 = createRecorder('CODE01');
    rec1.addEvent('session_start', 'Host1', {});
    rec1.addSnapshot('a.txt', 'hello');
    rec1.finish();
    const id1 = saveRecording(rec1, tmpDir);

    const rec2 = createRecorder('CODE02');
    rec2.addEvent('session_start', 'Host2', {});
    rec2.finish();
    const id2 = saveRecording(rec2, tmpDir);

    // Corrupted file
    fs.writeFileSync(path.join(tmpDir, 'cccccccccccc.json'), 'bad json', 'utf8');

    const all = listRecordings(tmpDir);
    assert.equal(all.length, 2);
    assert.equal(all[0].id, id2);
    assert.equal(all[1].id, id1);
    assert.equal(all[1].snapshotCount, 1);

    const host1Only = listRecordings(tmpDir, (data) => data.participants?.includes('Host1'));
    assert.equal(host1Only.length, 1);
    assert.equal(host1Only[0].id, id1);

    const nobody = listRecordings(tmpDir, (data) => data.participants?.includes('Nobody'));
    assert.equal(nobody.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});


