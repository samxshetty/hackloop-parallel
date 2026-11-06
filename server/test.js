'use strict';

const assert = require('assert');
const WebSocket = require('ws');
const {
  computeWrapped,
  sanitizeName,
  sanitizeGithubLogin,
  calculateLongestFocusStreak,
  calculatePeakMinute,
} = require('./wrapped/stats');
const { sampleWrapped } = require('./wrapped/sample');
const {
  MAX_PATH_LENGTH,
  MAX_PROJECT_FILES,
  MAX_FILE_BYTES,
  MAX_ACTIVE_FILE_BYTES,
  MAX_TOTAL_BYTES,
  sanitizeRelativePath,
  isBinaryBuffer,
  isSensitiveFile,
  isExcludedPath,
} = require('./project/paths');
const defaultPatterns = require('./safety/patterns');
const { maskSecrets } = require('./safety/mask');
const { reconcileGuestEdit, getChangeRegion } = require('./safety/edit-guard');
const { recordEdit, getContributions, clearSession: clearContribSession } = require('./safety/contributions');

// ==========================================
// 1. UNIT TESTS FOR SESSION WRAPPED STATS
// ==========================================

function runWrappedUnitTests() {
  console.log('Running Wrapped Stats Unit Tests...');

  // --- Sanitization & Validation ---
  assert.strictEqual(sanitizeName('  Alice  '), 'Alice');
  assert.strictEqual(sanitizeName('A'.repeat(50)), 'A'.repeat(32));
  assert.strictEqual(sanitizeName('<script>Bob</script>'), 'scriptBob/script');
  assert.strictEqual(sanitizeName(null), 'Participant');
  assert.strictEqual(sanitizeName(''), 'Participant');

  assert.strictEqual(sanitizeGithubLogin('torvalds'), 'torvalds');
  assert.strictEqual(sanitizeGithubLogin('user-123'), 'user-123');
  assert.strictEqual(sanitizeGithubLogin('-invalid'), null);
  assert.strictEqual(sanitizeGithubLogin('inv@lid!'), null);
  assert.strictEqual(sanitizeGithubLogin('a'.repeat(45)), null);
  assert.strictEqual(sanitizeGithubLogin(null), null);

  // --- Focus Streak ---
  assert.strictEqual(calculateLongestFocusStreak([]), 0, 'Empty edits should yield 0 focus streak');
  assert.strictEqual(calculateLongestFocusStreak([1000]), 0, 'Single edit should yield 0 focus streak');

  // Consecutive edits within 60s (0s, 20s, 50s -> streak is 50s)
  const streak1 = calculateLongestFocusStreak([1000, 21000, 51000]);
  assert.strictEqual(streak1, 50000, 'Streak should be 50,000ms');

  // Two streaks: (0s, 30s) and (120s, 140s, 180s, 220s)
  // Gap between 30s and 120s is 90s (> 60s), so streak resets.
  // Second streak: 220s - 120s = 100s = 100,000ms
  const streak2 = calculateLongestFocusStreak([0, 30000, 120000, 140000, 180000, 220000]);
  assert.strictEqual(streak2, 100000, 'Longest streak should be 100,000ms');

  // --- Peak Minute ---
  assert.strictEqual(calculatePeakMinute([], 0).peakMinuteEdits, 0);
  const now = 1730000000000;
  const now0 = Math.floor(now / 60000) * 60000;
  // 3 edits in minute 0, 5 edits in minute 1, 2 edits in minute 2
  const peakEdits = [
    now0 + 1000, now0 + 15000, now0 + 30000, // minute 0
    now0 + 62000, now0 + 70000, now0 + 80000, now0 + 90000, now0 + 110000, // minute 1 (5 edits)
    now0 + 130000, now0 + 150000, // minute 2
  ];
  const peakRes = calculatePeakMinute(peakEdits, now0);
  assert.strictEqual(peakRes.peakMinuteEdits, 5, 'Peak minute should have 5 edits');
  assert.strictEqual(peakRes.peakMinuteAt, now0 + 60000);

  // --- Contribution Percentages ---
  const snapshotContributions = {
    code: 'TEST01',
    startedAt: now,
    endedAt: now + 300000,
    participants: [
      { id: 'p1', name: 'Alice', role: 'SUPERHOST', linesModified: 60, charsAdded: 600 },
      { id: 'p2', name: 'Bob', role: 'HOST', linesModified: 30, charsAdded: 300 },
      { id: 'p3', name: 'Carol', role: 'GUEST', linesModified: 10, charsAdded: 100 },
    ],
  };
  const wrappedContrib = computeWrapped(snapshotContributions);
  assert.strictEqual(wrappedContrib.participants[0].contributionPct, 60);
  assert.strictEqual(wrappedContrib.participants[1].contributionPct, 30);
  assert.strictEqual(wrappedContrib.participants[2].contributionPct, 10);
  assert.strictEqual(wrappedContrib.mvp.participantId, 'p1', 'Alice should be MVP');

  // --- Awards: Clear Winners & Max 1 Per Person ---
  const snapshotAwards = {
    code: 'AWARDS',
    startedAt: new Date(2026, 10, 5, 23, 0, 0).getTime(), // 11 PM local -> Night Owl eligible
    endedAt: new Date(2026, 10, 5, 23, 45, 0).getTime(),
    participants: [
      {
        id: 'p-host',
        name: 'HostUser',
        role: 'SUPERHOST',
        charsAdded: 100,
        charsDeleted: 20,
        linesModified: 10,
        activeMs: 60000,
        editRequestsApprovedByMe: 3,
      },
      {
        id: 'p-fixer',
        name: 'FixerUser',
        role: 'HOST',
        charsAdded: 200,
        charsDeleted: 1500, // Top deleted
        linesModified: 40,
        activeMs: 120000,
      },
      {
        id: 'p-speed',
        name: 'SpeedyUser',
        role: 'GUEST',
        charsAdded: 3000, // 3000 chars in 1 min
        charsDeleted: 10,
        linesModified: 80,
        activeMs: 60000,
      },
      {
        id: 'p-silent',
        name: 'QuietUser',
        role: 'GUEST',
        charsAdded: 0,
        charsDeleted: 0,
        linesModified: 0,
        activeMs: 0,
      },
      {
        id: 'p-night',
        name: 'NightCoder',
        role: 'GUEST',
        charsAdded: 50,
        charsDeleted: 5,
        linesModified: 5,
        activeMs: 30000,
      },
    ],
  };
  const wrappedAwards = computeWrapped(snapshotAwards);
  const awardKeys = wrappedAwards.awards.map((a) => a.key);
  assert(awardKeys.includes('the_fixer'), 'Must award The Fixer');
  assert(awardKeys.includes('speed_typer'), 'Must award Speed Typer');
  assert(awardKeys.includes('gatekeeper'), 'Must award Gatekeeper');
  assert(awardKeys.includes('silent_observer'), 'Must award Silent Observer');
  assert(awardKeys.includes('night_owl'), 'Must award Night Owl');

  // Verify max 1 award per person
  const recipientIds = wrappedAwards.awards.map((a) => a.participantId);
  const uniqueRecipients = new Set(recipientIds);
  assert.strictEqual(recipientIds.length, uniqueRecipients.size, 'No participant should receive multiple awards');

  // Skip award if no clear winner (tie for The Fixer)
  const snapshotTie = {
    code: 'NOTIE',
    startedAt: now,
    endedAt: now + 60000,
    participants: [
      { id: 'p1', name: 'Alice', role: 'HOST', charsDeleted: 50 },
      { id: 'p2', name: 'Bob', role: 'HOST', charsDeleted: 50 }, // Tie!
    ],
  };
  const wrappedTie = computeWrapped(snapshotTie);
  assert(!wrappedTie.awards.some((a) => a.key === 'the_fixer'), 'Tie for fixer should skip award');

  // --- Edge Cases ---

  // 1. Solo session
  const soloSnapshot = {
    code: 'SOLO01',
    startedAt: now,
    endedAt: now + 45000, // 45 seconds
    participants: [{ id: 'p1', name: 'SoloDev', role: 'SUPERHOST' }],
    editEvents: [],
  };
  const wrappedSolo = computeWrapped(soloSnapshot);
  assert.strictEqual(wrappedSolo.participants.length, 1);
  assert.strictEqual(wrappedSolo.participants[0].contributionPct, 100);
  assert.strictEqual(wrappedSolo.mvp.participantId, 'p1');
  assert.strictEqual(wrappedSolo.durationMs, 45000);

  // 2. Zero edits
  const zeroEditsSnapshot = {
    code: 'ZERO01',
    startedAt: now,
    endedAt: now + 120000,
    participants: [
      { id: 'p1', name: 'Host', role: 'SUPERHOST' },
      { id: 'p2', name: 'Guest', role: 'GUEST' },
    ],
    editEvents: [],
  };
  const wrappedZero = computeWrapped(zeroEditsSnapshot);
  assert.strictEqual(wrappedZero.totals.longestFocusMs, 0);
  assert.strictEqual(wrappedZero.totals.peakMinuteEdits, 0);
  assert.strictEqual(wrappedZero.totals.commits, 0);

  // 3. Session under 1 minute
  const shortSnapshot = {
    code: 'SHORT1',
    startedAt: now,
    endedAt: now + 25000, // 25s
    participants: [{ id: 'p1', name: 'QuickHost', role: 'SUPERHOST' }],
  };
  const wrappedShort = computeWrapped(shortSnapshot);
  assert.strictEqual(wrappedShort.durationMs, 25000);

  // 4. Up to 20 participants
  const twentyParticipants = Array.from({ length: 20 }, (_, i) => ({
    id: `p-${i + 1}`,
    name: `User_${i + 1}`,
    role: i === 0 ? 'SUPERHOST' : (i < 3 ? 'HOST' : 'GUEST'),
    linesModified: (i + 1) * 5,
    charsAdded: (i + 1) * 50,
  }));
  const wrappedTwenty = computeWrapped({
    code: 'FULL20',
    startedAt: now,
    endedAt: now + 3600000,
    participants: twentyParticipants,
  });
  assert.strictEqual(wrappedTwenty.participants.length, 20);
  assert.strictEqual(wrappedTwenty.mvp.participantId, 'p-20');

  // 5. Sample payload schema verification
  assert.strictEqual(sampleWrapped.v, 1);
  assert.strictEqual(sampleWrapped.code, 'K9X2B7');
  assert(Array.isArray(sampleWrapped.participants));
  assert.strictEqual(typeof sampleWrapped.totals.longestFocusMs, 'number');
  assert.strictEqual(typeof sampleWrapped.totals.secretsMasked, 'number');

  console.log('✔ All Wrapped Stats Unit Tests Passed!\n');
}

// ==========================================
// 2. INTEGRATION TEST FOR SERVER SOCKETS
// ==========================================

function connect(url = 'ws://localhost:8080') {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function nextMsg(ws, type) {
  return new Promise((resolve) => {
    const handler = (data) => {
      const msg = JSON.parse(data);
      if (!type || msg.t === type) {
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

async function runSocketTestsIfAvailable() {
  let host;
  let guest;
  try {
    host = await connect();
    guest = await connect();
  } catch {
    // If WebSocket server is not running on 8080, log and return
    console.log('Notice: WebSocket server not running on localhost:8080 (socket e2e skipped).');
    return;
  }

  console.log('Running Server Socket Integration Test...');
  const errors = [];

  // Host creates session
  send(host, { t: 'create', name: 'Host' });
  const created = await nextMsg(host, 'created');
  if (created.t !== 'created' || !created.code) {
    errors.push('create failed: ' + JSON.stringify(created));
  }
  const code = created.code;

  // Guest joins
  send(guest, { t: 'join', code, name: 'Alice' });
  const joinReq = await nextMsg(host, 'join_request');
  if (joinReq.t !== 'join_request' || joinReq.name !== 'Alice') {
    errors.push('join_request failed: ' + JSON.stringify(joinReq));
  }

  // Host approves
  send(host, { t: 'decide', name: 'Alice', approve: true });
  const [joinedMsg, peersMsg] = await Promise.all([nextMsg(guest, 'joined'), nextMsg(host, 'peers')]);
  if (joinedMsg.t !== 'joined') {
    errors.push('joined failed: ' + JSON.stringify(joinedMsg));
  }
  if (peersMsg.t !== 'peers' || !peersMsg.list.includes('Alice')) {
    errors.push('peers failed: ' + JSON.stringify(peersMsg));
  }

  // Host sends doc, guest receives it
  send(host, { t: 'doc', text: 'Hello World' });
  const docMsg = await nextMsg(guest, 'doc');
  if (docMsg.t !== 'doc' || docMsg.text !== 'Hello World') {
    errors.push('doc forward failed: ' + JSON.stringify(docMsg));
  }

  // Guest tries to send doc - should be blocked (no delivery)
  send(guest, { t: 'doc', text: 'hack attempt' });
  const noDelivery = await Promise.race([
    nextMsg(host, 'doc').then((m) => ({ got: m })),
    new Promise((r) => setTimeout(() => r({ timeout: true }), 500)),
  ]);
  if (!noDelivery.timeout) {
    errors.push('guest doc was delivered to host: ' + JSON.stringify(noDelivery.got));
  }

  // --- Multi-file socket flows ---
  // Host uploads project_manifest
  send(host, {
    t: 'project_manifest',
    manifest: [
      { path: 'src/app.js', size: 100 },
      { path: 'src/secret.js', size: 200 },
    ],
  });
  const updateMsg = await nextMsg(guest, 'project_update');
  if (updateMsg.t !== 'project_update' || !Array.isArray(updateMsg.manifest) || updateMsg.manifest.length !== 2) {
    errors.push('project_update failed: ' + JSON.stringify(updateMsg));
  }

  // Guest requests file outside manifest -> rejected
  send(guest, { t: 'file_request', path: 'untracked/secret.pem' });
  const errResp = await nextMsg(guest, 'error');
  if (errResp.t !== 'error' || errResp.msg !== 'file not in manifest') {
    errors.push('expected file not in manifest error, got: ' + JSON.stringify(errResp));
  }

  // Host sends file_content with a secret
  send(host, {
    t: 'file_content',
    files: [
      { path: 'src/app.js', text: 'export const hello = "world";' },
      { path: 'src/secret.js', text: 'const key = "sk-proj-1234567890abcdef1234567890abcdef";' },
    ],
  });

  // Small delay for server to process file_content
  await new Promise((r) => setTimeout(r, 100));

  // Guest requests valid file from manifest -> receives masked text in file_response
  send(guest, { t: 'file_request', path: 'src/secret.js' });
  const fileResp = await nextMsg(guest, 'file_response');
  if (fileResp.t !== 'file_response' || fileResp.path !== 'src/secret.js' || !fileResp.text.includes('••••••••') || fileResp.text.includes('sk-proj-')) {
    errors.push('file_response failed or leaked secret: ' + JSON.stringify(fileResp));
  }

  // Backward compatibility: doc without path defaults to active file
  send(host, { t: 'doc', text: 'backward compatible doc' });
  const docMsg2 = await nextMsg(guest, 'doc');
  if (docMsg2.t !== 'doc' || docMsg2.text !== 'backward compatible doc' || (!docMsg2.path && !docMsg2.file)) {
    errors.push('backward compatible doc failed: ' + JSON.stringify(docMsg2));
  }

  host.close();
  guest.close();

  if (errors.length) {
    console.error('Errors:', errors);
    throw new Error('Socket test failed');
  }
  console.log('✔ Server Socket Integration Test Passed!\n');
}

// ==========================================
// 1B. UNIT TESTS FOR PROJECT PATH SANITIZER & EXCLUSIONS
// ==========================================

function runProjectPathsUnitTests() {
  console.log('Running Project Paths & Exclusions Unit Tests...');

  // 1. Path sanitizer tests
  // Traversal rejection
  assert.strictEqual(sanitizeRelativePath('../foo.js'), null, 'Reject leading ..');
  assert.strictEqual(sanitizeRelativePath('src/../../foo.js'), null, 'Reject middle ..');
  assert.strictEqual(sanitizeRelativePath('src/..'), null, 'Reject trailing ..');
  assert.strictEqual(sanitizeRelativePath('..'), null, 'Reject lone ..');

  // Absolute path rejection
  assert.strictEqual(sanitizeRelativePath('/etc/passwd'), null, 'Reject leading /');
  assert.strictEqual(sanitizeRelativePath('\\Windows\\System32'), null, 'Reject leading \\');

  // Drive letter rejection
  assert.strictEqual(sanitizeRelativePath('C:\\project\\app.js'), null, 'Reject Windows drive C:');
  assert.strictEqual(sanitizeRelativePath('d:/project/app.js'), null, 'Reject Windows drive d:');

  // Empty segments & consecutive slashes
  assert.strictEqual(sanitizeRelativePath(''), null, 'Reject empty path');
  assert.strictEqual(sanitizeRelativePath('src//app.js'), null, 'Reject consecutive slashes');
  assert.strictEqual(sanitizeRelativePath('src/'), null, 'Reject trailing slash');
  assert.strictEqual(sanitizeRelativePath('.'), null, 'Reject lone .');

  // Null bytes
  assert.strictEqual(sanitizeRelativePath('src/app\0.js'), null, 'Reject null bytes');

  // Over-long paths (> 260 chars)
  const longPath = 'a/'.repeat(130) + 'file.js';
  assert(longPath.length > 260);
  assert.strictEqual(sanitizeRelativePath(longPath), null, 'Reject path > 260 chars');

  // Non-string inputs
  assert.strictEqual(sanitizeRelativePath(null), null);
  assert.strictEqual(sanitizeRelativePath(undefined), null);
  assert.strictEqual(sanitizeRelativePath(123), null);

  // Normalization of backslashes and relative paths
  assert.strictEqual(sanitizeRelativePath('src\\components\\App.tsx'), 'src/components/App.tsx');
  assert.strictEqual(sanitizeRelativePath('./src/index.js'), 'src/index.js');
  assert.strictEqual(sanitizeRelativePath('a/./b/./c.js'), 'a/b/c.js');

  // Unicode support
  assert.strictEqual(sanitizeRelativePath('src/föö/bär.ts'), 'src/föö/bär.ts');
  assert.strictEqual(sanitizeRelativePath('src/🚀/main.js'), 'src/🚀/main.js');

  // 2. Binary buffer detection
  const textBuf = Buffer.from('console.log("hello world");\n', 'utf8');
  assert.strictEqual(isBinaryBuffer(textBuf), false, 'Text buffer should not be binary');

  const binaryBuf = Buffer.from([0x68, 0x65, 0x6c, 0x00, 0x6f]);
  assert.strictEqual(isBinaryBuffer(binaryBuf), true, 'Buffer with NUL byte should be detected as binary');

  const emptyBuf = Buffer.alloc(0);
  assert.strictEqual(isBinaryBuffer(emptyBuf), false);
  assert.strictEqual(isBinaryBuffer(null), false);

  // 3. Exclusions: Default directories
  assert.strictEqual(isExcludedPath('.git/config'), true);
  assert.strictEqual(isExcludedPath('node_modules/ws/index.js'), true);
  assert.strictEqual(isExcludedPath('dist/bundle.js'), true);
  assert.strictEqual(isExcludedPath('out/extension.js'), true);
  assert.strictEqual(isExcludedPath('build/App.js'), true);
  assert.strictEqual(isExcludedPath('.vscode/settings.json'), true);
  assert.strictEqual(isExcludedPath('.idea/workspace.xml'), true);
  assert.strictEqual(isExcludedPath('.aws/credentials'), true);
  assert.strictEqual(isExcludedPath('.ssh/id_rsa'), true);

  // Exclusions: VSIX & Lockfiles
  assert.strictEqual(isExcludedPath('extension.vsix'), true);
  assert.strictEqual(isExcludedPath('package-lock.json'), true);
  assert.strictEqual(isExcludedPath('yarn.lock'), true);
  assert.strictEqual(isExcludedPath('pnpm-lock.yaml'), true);

  // Exclusions: Media & Binary extensions
  assert.strictEqual(isExcludedPath('assets/logo.png'), true);
  assert.strictEqual(isExcludedPath('assets/icon.svg'), true);
  assert.strictEqual(isExcludedPath('assets/favicon.ico'), true);
  assert.strictEqual(isExcludedPath('docs/manual.pdf'), true);
  assert.strictEqual(isExcludedPath('archive.zip'), true);

  // Exclusions: Sensitive files
  assert.strictEqual(isExcludedPath('.env'), true);
  assert.strictEqual(isExcludedPath('.env.local'), true);
  assert.strictEqual(isExcludedPath('.env.production'), true);
  assert.strictEqual(isExcludedPath('.env.example'), false, '.env.example is explicitly allowed');
  assert.strictEqual(isExcludedPath('server.key'), true);
  assert.strictEqual(isExcludedPath('cert.pem'), true);
  assert.strictEqual(isExcludedPath('cert.p12'), true);
  assert.strictEqual(isExcludedPath('cert.pfx'), true);
  assert.strictEqual(isExcludedPath('id_rsa'), true);
  assert.strictEqual(isExcludedPath('id_rsa.pub'), true);
  assert.strictEqual(isExcludedPath('.npmrc'), true);
  assert.strictEqual(isExcludedPath('.netrc'), true);
  assert.strictEqual(isExcludedPath('credentials.json'), true);
  assert.strictEqual(isExcludedPath('credentials-dev.json'), true);
  assert.strictEqual(isExcludedPath('my_secrets.txt'), true);
  assert.strictEqual(isExcludedPath('config/secret_token.js'), true);

  // Normal safe files
  assert.strictEqual(isExcludedPath('src/app.js'), false);
  assert.strictEqual(isExcludedPath('src/components/Header.tsx'), false);
  assert.strictEqual(isExcludedPath('README.md'), false);
  assert.strictEqual(isExcludedPath('package.json'), false);

  // Custom exclude patterns
  const customOpts = { exclude: ['temp/**', '*.log', 'test_fixtures/dummy.txt'] };
  assert.strictEqual(isExcludedPath('temp/cache.json', customOpts), true);
  assert.strictEqual(isExcludedPath('debug.log', customOpts), true);
  assert.strictEqual(isExcludedPath('test_fixtures/dummy.txt', customOpts), true);
  assert.strictEqual(isExcludedPath('src/main.ts', customOpts), false);

  // includeSensitiveFiles setting
  assert.strictEqual(isExcludedPath('.env', { includeSensitiveFiles: true }), false);
  assert.strictEqual(isExcludedPath('credentials.json', { includeSensitiveFiles: true }), false);
  // Still excludes non-sensitive defaults like .git even with includeSensitiveFiles: true
  assert.strictEqual(isExcludedPath('.git/config', { includeSensitiveFiles: true }), true);

  // Active file exception: Active file is NEVER excluded!
  assert.strictEqual(
    isExcludedPath('.env', { activeFile: '.env' }),
    false,
    'Active .env file must be shared'
  );
  assert.strictEqual(
    isExcludedPath('package-lock.json', { activeFile: 'package-lock.json' }),
    false,
    'Active lockfile must be shared'
  );
  assert.strictEqual(
    isExcludedPath('secret_config.json', { activeFile: 'secret_config.json' }),
    false,
    'Active secret file must be shared'
  );
  assert.strictEqual(
    isExcludedPath('src/App.tsx', { activeFile: 'src/App.tsx' }),
    false
  );

  // 4. Manifest limit constants
  assert.strictEqual(MAX_PROJECT_FILES, 500);
  assert.strictEqual(MAX_FILE_BYTES, 1024 * 1024);
  assert.strictEqual(MAX_ACTIVE_FILE_BYTES, 4 * 1024 * 1024);
  assert.strictEqual(MAX_TOTAL_BYTES, 25 * 1024 * 1024);

  console.log('✔ All Project Paths & Exclusions Unit Tests Passed!\n');
}

// ==========================================
// 1C. UNIT TESTS FOR MULTI-FILE SAFETY & LEDGER AGGREGATION
// ==========================================

function runMultiFileSafetyAndLedgerTests() {
  console.log('Running Multi-File Safety & Ledger Aggregation Unit Tests...');

  // 1. Multi-file masking test
  const fileAText = "const apiKey = 'sk-proj-1234567890abcdef1234567890abcdef';\nconst x = 1;\n";
  const fileBText = "const myAwsAccessKey = 'AKIAIOSFODNN7EXAMPLE';\nconst secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';\nPORT=8080;\n";

  const maskA = maskSecrets(fileAText);
  const maskB = maskSecrets(fileBText);

  assert(maskA.count > 0, 'File A should have detected secret');
  assert(maskA.spans.length > 0, 'File A should have secret spans');
  assert(maskA.text.includes('••••••••'), 'File A secret should be masked');
  assert(maskA.text.includes('const x = 1;'), 'File A non-secret should be intact');

  assert(maskB.count > 0, 'File B should have detected secret');
  assert(maskB.spans.length > 0, 'File B should have secret spans');
  assert(maskB.text.includes('••••••••'), 'File B secret should be masked');
  assert(maskB.text.includes('PORT=8080;'), 'File B non-secret should be intact');

  // Verify spans are distinct and appropriate for each file
  assert.notStrictEqual(maskA.spans[0].start, maskB.spans[0].start);

  // 2. Per-file edit guard: edits in File 1 vs hidden secret in File 2
  const raw1 = 'function add(a, b) {\n  return a + b;\n}';
  const new1 = 'function add(a, b) {\n  return a + b + 0;\n}';
  const res1 = reconcileGuestEdit(raw1, raw1, [], new1);
  assert.strictEqual(res1.ok, true, 'Clean file edit should be accepted');
  assert.strictEqual(res1.rawNew, new1);

  // File 2 has secret
  const raw2 = 'const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";\nconst active = true;\n';
  const mask2 = maskSecrets(raw2);
  assert(mask2.count > 0);

  // Tampering with masked secret span
  const tampered2 = mask2.text.replace('••••••••••••••••••••••••••••••••••••', 'ghp_HACKED_VALUE_1234567890');
  const resTamper = reconcileGuestEdit(raw2, mask2.text, mask2.spans, tampered2);
  assert.strictEqual(resTamper.ok, false, 'Tampered secret in second file must be rejected');
  assert.strictEqual(resTamper.error, "That value is hidden and can't be edited");

  // Safe edit in File 2 outside secret
  const safe2 = mask2.text.replace('active = true;', 'active = false;');
  const resSafe = reconcileGuestEdit(raw2, mask2.text, mask2.spans, safe2);
  assert.strictEqual(resSafe.ok, true, 'Safe edit in second file should be accepted');
  assert(resSafe.rawNew.includes('ghp_1234567890abcdefghijklmnopqrstuvwxyz'), 'Raw secret must be preserved');
  assert(resSafe.rawNew.includes('active = false;'), 'Safe edit must be reflected');

  // 3. Ledger aggregation across two files
  const testCode = 'TEST_MULTI_FILE_LEDGER';
  clearContribSession(testCode);

  const sessionObj = { code: testCode, host: { code: testCode } };
  const guestWs = { name: 'Carol', role: 'guest', canEdit: true, code: testCode };

  // Edit in file 1
  const f1Old = 'line1\n';
  const f1New = 'line1\nline2\nline3\n'; // 2 lines added
  const change1 = getChangeRegion(f1Old, f1New);
  recordEdit(sessionObj, guestWs, f1Old, f1New, change1, () => {});

  // Edit in file 2
  const f2Old = 'const x = 1;\n';
  const f2New = 'const x = 1;\nconst y = 2;\nconst z = 3;\n'; // 2 lines added
  const change2 = getChangeRegion(f2Old, f2New);
  recordEdit(sessionObj, guestWs, f2Old, f2New, change2, () => {});

  const contributions = getContributions(testCode);
  const carolContrib = contributions.find((c) => c.name === 'Carol');
  assert(carolContrib, 'Carol should be in contributions');
  assert.strictEqual(carolContrib.lines, 6, 'Lines changed should aggregate across both files (3 + 3 = 6)');
  assert(carolContrib.edits >= 1, 'Edits count should be tracked');
  assert.strictEqual(carolContrib.revoked, false);

  clearContribSession(testCode);

  console.log('✔ All Multi-File Safety & Ledger Aggregation Unit Tests Passed!\n');
}

// ==========================================
// 1D. UNIT TESTS FOR SAFETY PATTERNS (AQ & ENV-STYLE SECRETS)
// ==========================================

function runSafetyPatternTests() {
  console.log('Running Safety Patterns (AQ & Env-Style Secrets) Unit Tests...');

  // 1. Regression test: verify all 10 original patterns still exist and match
  assert(defaultPatterns.length >= 10, 'Must have at least 10 patterns');
  const original10Tests = [
    { name: 'AWS Access Key', input: 'AKIAIOSFODNN7EXAMPLE' },
    { name: 'OpenAI / Anthropic API Key', input: 'sk-proj-1234567890abcdef1234567890abcdef' },
    { name: 'Stripe API Key', input: ['sk','live','1234567890abcdef12345678'].join('_') },
    { name: 'GitHub Token', input: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz' },
    { name: 'Google API Key', input: 'AIzaSyD-1234567890abcdef1234567890abcde' },
    { name: 'Slack Token', input: ['xoxb','1234567890','1234567890123','abcdefghijklmnop'].join('-') },
    { name: 'JSON Web Token', input: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' },
    { name: 'PEM Private Key', input: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----' },
    { name: 'Database URL', input: 'postgres://user:pass1234@localhost:5432/mydb' },
    { name: 'Secret Assignment', input: 'password = "secret12345"' },
  ];

  for (const t of original10Tests) {
    const p = defaultPatterns.find((item) => item.name === t.name);
    assert(p, `Original pattern "${t.name}" must exist`);
    const regex = new RegExp(p.regex.source, p.regex.flags);
    assert(regex.test(t.input), `Original pattern "${t.name}" must match: ${t.input}`);
  }

  // 2. Google API Key (AQ) pattern tests
  const aqPattern = defaultPatterns.find((p) => p.name === 'Google API Key (AQ)');
  assert(aqPattern, 'Google API Key (AQ) pattern must exist');
  assert(new RegExp(aqPattern.regex.source).test('AQ.Ab8RN6LQ1234567890abcdef'), 'AQ key must match standalone');
  assert(new RegExp(aqPattern.regex.source).test('"AQ.Ab8RN6LQ1234567890abcdef"'), 'AQ key must match in quotes');
  assert(!new RegExp(aqPattern.regex.source).test('AQ.short'), 'Short AQ key under 20 chars must not match');
  assert(!new RegExp(aqPattern.regex.source).test('notAQ.Ab8RN6LQ1234567890abcdef'), 'Preceded by word char must not match');

  // Standalone AQ masking
  const aqMask = maskSecrets('const key = "AQ.Ab8RN6LQ1234567890abcdef";');
  assert(aqMask.count > 0);
  assert.strictEqual(aqMask.text, 'const key = "•••••••••••••••••••••••••••";');

  // 3. Generic env-style assignment pattern tests
  const envCases = [
    { text: 'GEMINI_API_KEY="AQ.Ab8RN6LQ1234567890abcdef"', expected: 'GEMINI_API_KEY="•••••••••••••••••••••••••••"' },
    { text: 'GEMINI_API_KEY=AQ.Ab8RN6LQ1234567890abcdef', expected: 'GEMINI_API_KEY=•••••••••••••••••••••••••••' },
    { text: 'export GEMINI_API_KEY="AQ.Ab8RN6LQ1234567890abcdef"', expected: 'export GEMINI_API_KEY="•••••••••••••••••••••••••••"' },
    { text: 'MY_DB_PASSWORD="changeme"', expected: 'MY_DB_PASSWORD="••••••••"' },
    { text: 'MY_DB_PASSWORD=changeme', expected: 'MY_DB_PASSWORD=••••••••' },
    { text: 'authToken: "abcdef123456"', expected: 'authToken: "••••••••••••"' },
    { text: 'authToken: abcdef123456', expected: 'authToken: ••••••••••••' },
    { text: 'FTP_PASSWD="my_secure_passwd"', expected: 'FTP_PASSWD="••••••••••••••••"' },
    { text: 'DB_PWD=secret_pwd_123', expected: 'DB_PWD=••••••••••••••' },
    { text: 'USER_CREDENTIALS="my_credentials_xyz"', expected: 'USER_CREDENTIALS="••••••••••••••••••"' },
    { text: 'APP_PRIVATE_KEY="my_secret_key_12345"', expected: 'APP_PRIVATE_KEY="•••••••••••••••••••"' },
    { text: 'CLIENT_SECRET=my_client_secret_999', expected: 'CLIENT_SECRET=••••••••••••••••••••' },
  ];

  for (const c of envCases) {
    const m = maskSecrets(c.text);
    assert.strictEqual(m.text, c.expected, `Masking failed for ${c.text}`);
    assert.strictEqual(m.text.length, c.text.length, 'Length must be preserved');
    assert(m.count > 0, 'Must have at least 1 masked interval');
  }

  // 4. Non-secrets avoidance (empty, ${VAR}, <6 chars, unrelated keys)
  const nonSecretCases = [
    'EMPTY_KEY=""',
    'EMPTY_KEY=\'\'',
    'EMPTY_KEY=',
    'KEY="${VAR}"',
    'KEY=\'${VAR}\'',
    'KEY=${VAR}',
    'KEY="${DB_PASS:-secret}"',
    'KEY=$DB_PASS',
    'SHORT_KEY="12345"',
    'SHORT_KEY=12345',
    'SHORT_KEY="admin"',
    'SHORT_KEY=admin',
    'PORT=8080',
    'NODE_ENV=production',
    'DATABASE_HOST=localhost',
  ];

  for (const ns of nonSecretCases) {
    const m = maskSecrets(ns);
    assert.strictEqual(m.count, 0, `Non-secret should not be masked: ${ns}`);
    assert.strictEqual(m.text, ns, `Non-secret text should not change: ${ns}`);
  }

  // 5. Edit guard behavior with env-style secrets
  const envFileRaw = 'PORT=8080\nGEMINI_API_KEY="AQ.Ab8RN6LQ1234567890abcdef"\nHOST=localhost\n';
  const envFileMasked = maskSecrets(envFileRaw);
  assert(envFileMasked.count > 0);

  // Tamper edit inside masked bullets
  const tamperedEnv = envFileMasked.text.replace('•••••••••••••••••••••••••••', 'AQ.MODIFIED_VALUE_12345678');
  const resTamper = reconcileGuestEdit(envFileRaw, envFileMasked.text, envFileMasked.spans, tamperedEnv);
  assert.strictEqual(resTamper.ok, false, 'Tampered secret in env file must be rejected');
  assert.strictEqual(resTamper.error, "That value is hidden and can't be edited");

  // Safe edit outside masked bullets
  const safeEnv = envFileMasked.text.replace('PORT=8080', 'PORT=3000');
  const resSafe = reconcileGuestEdit(envFileRaw, envFileMasked.text, envFileMasked.spans, safeEnv);
  assert.strictEqual(resSafe.ok, true, 'Safe edit outside secret in env file should be accepted');
  assert(resSafe.rawNew.includes('PORT=3000'));
  assert(resSafe.rawNew.includes('AQ.Ab8RN6LQ1234567890abcdef'), 'Raw AQ secret must be preserved');

  console.log('✔ All Safety Patterns (AQ & Env-Style Secrets) Unit Tests Passed!\n');
}

async function main() {
  runWrappedUnitTests();
  runProjectPathsUnitTests();
  runMultiFileSafetyAndLedgerTests();
  runSafetyPatternTests();
  await runSocketTestsIfAvailable();
  console.log('PASS');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  console.log('FAIL');
  process.exit(1);
});
