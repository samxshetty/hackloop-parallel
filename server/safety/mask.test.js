'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { maskSecrets, isSuggestionMasked } = require('./mask');

// Build fake keys from string parts so no real-looking secret is stored in the repo
const fakeAwsKey = ['AKIA', '1234', '5678', '90AB', 'CDEF'].join('');
const fakeOpenAiKey = ['sk-', 'proj-', '1234567890abcdef12345678'].join('');
const fakeAnthropicKey = ['sk-', 'ant-', '1234567890abcdef12345678'].join('');
const fakeStripeKey = ['sk_live_', '0123456789abcdef01234567'].join('');
const fakeStripeRk = ['rk_live_', '0123456789abcdef01234567'].join('');
const fakeGithubGhp = ['ghp_', '1234567890abcdef1234567890abcdef'].join('');
const fakeGithubPat = ['github_pat_', '1234567890abcdef1234567890'].join('');
const fakeGoogleKey = ['AIza', 'SyD12345678901234567890123456789012'].join('');
const fakeSlackToken = ['xoxb-', '123456789012-1234567890123-fakeSlackToken123'].join('');
const fakeJwt = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ',
  'fakeSignature1234567890abcdef123',
].join('.');
const fakeDbUrl = ['postgres://', 'dbuser', ':', 'superSecretPass', '@localhost:5432/my_database'].join('');
const fakePemKey = [
  ['-----BEGIN', 'RSA', 'PRIVATE KEY-----'].join(' '),
  'MIIEowIBAAKCAQEA0fakeKeyLine123456789012345678901234567890',
  'fakeKeyLine21234567890123456789012345678901234567890123456',
  ['-----END', 'RSA', 'PRIVATE KEY-----'].join(' '),
].join('\n');

test('masks AWS access key', () => {
  const input = `const key = "${fakeAwsKey}";`;
  const res = maskSecrets(input);
  assert.strictEqual(res.text.length, input.length);
  assert.ok(!res.text.includes(fakeAwsKey));
  assert.ok(res.kinds.includes('AWS Access Key'));
  assert.strictEqual(res.count, 1);
});

test('masks OpenAI and Anthropic keys', () => {
  const input1 = `OPENAI_API_KEY="${fakeOpenAiKey}"`;
  const res1 = maskSecrets(input1);
  assert.strictEqual(res1.text.length, input1.length);
  assert.ok(!res1.text.includes(fakeOpenAiKey));
  assert.ok(res1.kinds.includes('OpenAI / Anthropic API Key'));

  const input2 = `ANTHROPIC_KEY="${fakeAnthropicKey}"`;
  const res2 = maskSecrets(input2);
  assert.strictEqual(res2.text.length, input2.length);
  assert.ok(!res2.text.includes(fakeAnthropicKey));
  assert.ok(res2.kinds.includes('OpenAI / Anthropic API Key'));
});

test('masks Stripe live keys', () => {
  const input = `const sk = "${fakeStripeKey}"; const rk = "${fakeStripeRk}";`;
  const res = maskSecrets(input);
  assert.strictEqual(res.text.length, input.length);
  assert.ok(!res.text.includes(fakeStripeKey));
  assert.ok(!res.text.includes(fakeStripeRk));
  assert.ok(res.kinds.includes('Stripe API Key'));
  assert.strictEqual(res.count, 2);
});

test('masks GitHub tokens (ghp and github_pat)', () => {
  const input = `ghp="${fakeGithubGhp}" pat="${fakeGithubPat}"`;
  const res = maskSecrets(input);
  assert.strictEqual(res.text.length, input.length);
  assert.ok(!res.text.includes(fakeGithubGhp));
  assert.ok(!res.text.includes(fakeGithubPat));
  assert.ok(res.kinds.includes('GitHub Token'));
  assert.strictEqual(res.count, 2);
});

test('masks Google API key', () => {
  const input = `const googleApiKey = '${fakeGoogleKey}';`;
  const res = maskSecrets(input);
  assert.strictEqual(res.text.length, input.length);
  assert.ok(!res.text.includes(fakeGoogleKey));
  assert.ok(res.kinds.includes('Google API Key'));
});

test('masks Slack token', () => {
  const input = `SLACK_TOKEN: "${fakeSlackToken}"`;
  const res = maskSecrets(input);
  assert.strictEqual(res.text.length, input.length);
  assert.ok(!res.text.includes(fakeSlackToken));
  assert.ok(res.kinds.includes('Slack Token'));
});

test('masks JWT', () => {
  const input = `Authorization: Bearer ${fakeJwt}`;
  const res = maskSecrets(input);
  assert.strictEqual(res.text.length, input.length);
  assert.ok(!res.text.includes(fakeJwt));
  assert.ok(res.kinds.includes('JSON Web Token'));
});

test('masks PEM private key line-by-line preserving newlines', () => {
  const res = maskSecrets(fakePemKey);
  assert.strictEqual(res.text.length, fakePemKey.length);
  assert.strictEqual(res.text.split('\n').length, fakePemKey.split('\n').length);
  assert.ok(!res.text.includes('BEGIN'));
  assert.ok(!res.text.includes('END'));
  assert.ok(res.kinds.includes('PEM Private Key'));
});

test('masks database URLs with credentials', () => {
  const input = `DATABASE_URL="${fakeDbUrl}"`;
  const res = maskSecrets(input);
  assert.strictEqual(res.text.length, input.length);
  assert.ok(!res.text.includes('superSecretPass'));
  assert.ok(res.kinds.includes('Database URL'));
});

test('masks key-value assignments for password, secret, token, api_key, apikey', () => {
  const cases = [
    'password = "mySecretPassword123"',
    'secret: \'topSecretString\'',
    'token = "someRandomTokenVal"',
    'api_key = "abcdef123456"',
    'apikey: "ghijkl654321"',
    'PASSWORD = "UPPERCASE_SECRET"',
  ];

  for (const c of cases) {
    const res = maskSecrets(c);
    assert.strictEqual(res.text.length, c.length, `Length preserved for: ${c}`);
    assert.ok(res.count > 0, `Detected secret in: ${c}`);
    assert.ok(!res.text.startsWith('••••'), `Variable name preserved for: ${c}`);
    assert.ok(res.kinds.includes('Secret Assignment'));
  }
});

test('no false positives on normal code and prose', () => {
  const code = `
    function checkPasswordStrength(password) {
      if (!password) return 0;
      return password.length > 8 ? 2 : 1;
    }
    const token = getTokenFromHeader();
    console.log("The secret of success is perseverance.");
    // Please enter your password when prompted by the application.
  `;
  const res = maskSecrets(code);
  assert.strictEqual(res.count, 0);
  assert.strictEqual(res.kinds.length, 0);
  assert.strictEqual(res.text, code);
});

test('handles multiple secrets per line', () => {
  const line = `const a = "${fakeAwsKey}"; const b = "${fakeStripeKey}";`;
  const res = maskSecrets(line);
  assert.strictEqual(res.text.length, line.length);
  assert.strictEqual(res.count, 2);
  assert.ok(!res.text.includes(fakeAwsKey));
  assert.ok(!res.text.includes(fakeStripeKey));
});

test('handles empty and non-string inputs safely', () => {
  assert.deepStrictEqual(maskSecrets(''), { text: '', count: 0, kinds: [] });
  assert.deepStrictEqual(maskSecrets(null), { text: '', count: 0, kinds: [] });
  assert.deepStrictEqual(maskSecrets(undefined), { text: '', count: 0, kinds: [] });
});

test('very large input (1 MB under 200 ms)', () => {
  const line = 'const data = { id: 10, name: "test item", count: 42, active: true };\n';
  const largeInput = line.repeat(20000); // ~1.4 MB
  assert.ok(Buffer.byteLength(largeInput) >= 1024 * 1024, 'Input is at least 1MB');

  const start = performance.now();
  const res = maskSecrets(largeInput);
  const duration = performance.now() - start;

  assert.strictEqual(res.text.length, largeInput.length);
  assert.strictEqual(res.count, 0);
  assert.ok(duration < 200, `Expected < 200ms, took ${duration.toFixed(2)}ms`);
});

test('isSuggestionMasked detects overlapping suggestions and ignores non-overlapping', () => {
  const doc = 'const x = 1;\nconst apiKey = "' + fakeAwsKey + '";\nconst y = 2;';
  // Overlapping suggestion on line 1
  assert.strictEqual(isSuggestionMasked({ line: 1, text: 'hack' }, doc), true);
  // Overlapping suggestion containing bullet characters
  assert.strictEqual(isSuggestionMasked({ line: 0, text: '••••' }, doc), true);
  // Non-overlapping suggestion on lines 0 and 2
  assert.strictEqual(isSuggestionMasked({ line: 0, text: 'const a = 1;' }, doc), false);
  assert.strictEqual(isSuggestionMasked({ line: 2, text: 'const b = 2;' }, doc), false);
});
