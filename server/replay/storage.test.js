'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { saveRecording, getRecording, pruneRecordings } = require('./storage');
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
