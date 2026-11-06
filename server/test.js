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

async function main() {
  runWrappedUnitTests();
  runProjectPathsUnitTests();
  await runSocketTestsIfAvailable();
  console.log('PASS');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  console.log('FAIL');
  process.exit(1);
});
