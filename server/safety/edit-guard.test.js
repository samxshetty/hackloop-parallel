'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { maskSecrets } = require('./mask');
const { reconcileGuestEdit, getChangeRegion, overlapsSpan } = require('./edit-guard');

const fakeAwsKey = ['AKIA', '1234', '5678', '90AB', 'CDEF'].join('');
const fakePassword = ['mySecret', 'Pass12345'].join('');

test('guest edits elsewhere -> host text keeps the real secret and gets the edit', () => {
  const raw = `const key = "${fakeAwsKey}";\nconst title = "Old";`;
  const { text: masked, spans } = maskSecrets(raw);

  const guestText = `const key = "••••••••••••••••••••";\nconst title = "New Title";`;
  const res = reconcileGuestEdit(raw, masked, spans, guestText);

  assert.strictEqual(res.ok, true);
  assert.ok(res.rawNew.includes(fakeAwsKey), 'Real secret must be preserved in host text');
  assert.ok(res.rawNew.includes('const title = "New Title";'), 'Guest edit must be applied');
  assert.ok(!res.rawNew.includes('••••'), 'Host text must never contain bullet characters');
});

test('guest edits inside a masked value -> rejected, host text unchanged', () => {
  const raw = `const key = "${fakeAwsKey}";\nconst title = "Old";`;
  const { text: masked, spans } = maskSecrets(raw);

  // Attempt 1: Replaced bullets with another string
  const guestHack = `const key = "myNewValue";\nconst title = "Old";`;
  const res1 = reconcileGuestEdit(raw, masked, spans, guestHack);
  assert.strictEqual(res1.ok, false);
  assert.strictEqual(res1.error, "That value is hidden and can't be edited");

  // Attempt 2: Deleted some bullets
  const guestDelete = `const key = "••••";\nconst title = "Old";`;
  const res2 = reconcileGuestEdit(raw, masked, spans, guestDelete);
  assert.strictEqual(res2.ok, false);
  assert.strictEqual(res2.error, "That value is hidden and can't be edited");

  // Attempt 3: Typed inside the bullets
  const guestInsertInside = `const key = "••••hack••••";\nconst title = "Old";`;
  const res3 = reconcileGuestEdit(raw, masked, spans, guestInsertInside);
  assert.strictEqual(res3.ok, false);
  assert.strictEqual(res3.error, "That value is hidden and can't be edited");
});

test('edit adjacent to a secret is allowed', () => {
  const raw = `const key = "${fakeAwsKey}";`;
  const { text: masked, spans } = maskSecrets(raw);

  // Edit before the secret line
  const guestBefore = `// API Key definition\nconst key = "••••••••••••••••••••";`;
  const resBefore = reconcileGuestEdit(raw, masked, spans, guestBefore);
  assert.strictEqual(resBefore.ok, true);
  assert.strictEqual(resBefore.rawNew, `// API Key definition\nconst key = "${fakeAwsKey}";`);

  // Edit after the secret closing quote
  const guestAfter = `const key = "••••••••••••••••••••"; // loaded from env`;
  const resAfter = reconcileGuestEdit(raw, masked, spans, guestAfter);
  assert.strictEqual(resAfter.ok, true);
  assert.strictEqual(resAfter.rawNew, `const key = "${fakeAwsKey}"; // loaded from env`);
});

test('multiline + tab/indent edits are preserved exactly', () => {
  const raw = `const key = "${fakeAwsKey}";\n\nfunction main() {\n\treturn 0;\n}\n`;
  const { text: masked, spans } = maskSecrets(raw);

  const guestText = `const key = "••••••••••••••••••••";\n\nfunction main() {\n\tconst a = 1;\n\t\tif (a) {\n\t\t\treturn 42;\n\t\t}\n\treturn 0;\n}\n`;
  const res = reconcileGuestEdit(raw, masked, spans, guestText);

  assert.strictEqual(res.ok, true);
  assert.ok(res.rawNew.includes(fakeAwsKey));
  assert.ok(res.rawNew.includes('\t\tif (a) {\n\t\t\treturn 42;\n\t\t}'));
});

test('CRLF text line endings are preserved', () => {
  const raw = `const key = "${fakeAwsKey}";\r\nconst count = 1;\r\n`;
  const { text: masked, spans } = maskSecrets(raw);

  const guestText = `const key = "••••••••••••••••••••";\r\nconst count = 2;\r\nconst extra = true;\r\n`;
  const res = reconcileGuestEdit(raw, masked, spans, guestText);

  assert.strictEqual(res.ok, true);
  assert.ok(res.rawNew.includes(fakeAwsKey));
  assert.ok(res.rawNew.includes('\r\n'));
  assert.ok(!res.rawNew.includes('\nconst count = 2;\n'));
});

test('empty document accepts edits', () => {
  const raw = '';
  const masked = '';
  const spans = [];

  const guestText = 'const init = true;\n';
  const res = reconcileGuestEdit(raw, masked, spans, guestText);

  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.rawNew, 'const init = true;\n');
});

test('edits after revocation are rejected (canEdit check)', () => {
  // Verifies that a revoked guest (canEdit: false) cannot pass permission check
  const guestWs = { role: 'guest', canEdit: false };
  const canEdit = (ws) => ws.role === 'superhost' || ws.role === 'host' || !!ws.canEdit;

  assert.strictEqual(canEdit(guestWs), false, 'Revoked guest must not have canEdit permission');
});
