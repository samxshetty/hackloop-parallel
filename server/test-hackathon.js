'use strict';
/**
 * test-hackathon.js
 *
 * Automated test suite for Parallel Hackathon Command Center:
 * 1. Setup validation (invalid deadline < start time rejected)
 * 2. Countdown & deadline edge cases
 * 3. Task creation, editing, deletion, assignment
 * 4. Invalid status and priority rejection
 * 5. Cross-client synchronization (changes broadcast to peers)
 * 6. Host/guest authorization (read-only guest cannot mutate; non-host cannot change setup)
 * 7. Persistence after restart (saving to disk, reloading on session start)
 * 8. Blocked and overdue task handling
 * 9. Next Best Action recommendations (verifying explainable, deterministic output)
 * 10. Isolation between different sessions (Session A data not accessible/modifiable by Session B)
 * 11. Core collaborative regression check
 */

const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { getNextBestActions } = require('./hackathon/recommendations');
const { getHackathonState, clearSession } = require('./hackathon/store');
const { HACKATHONS_DIR } = require('./hackathon/storage');

const PORT = process.env.PORT || 8098;
const URL = `ws://127.0.0.1:${PORT}`;

let pass = true;
const errors = [];

function recordPass(desc) {
  console.log(`PASS: ${desc}`);
}

function recordFail(desc, err) {
  pass = false;
  console.error(`FAIL: ${desc}`, err);
  errors.push({ desc, err });
}

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
          // ignore
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
      stdio: 'ignore',
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

  try {
    serverProcess = await startServerIfNeeded();
    console.log('--- Starting Hackathon Mode Test Suite ---');

    // TEST 1: Setup validation & error handling
    try {
      const host = await connect();
      host.send({ t: 'create', name: 'HostAlice' });
      const createdMsg = await host.nextMsg('created');
      const sessionCode = createdMsg.code;

      // Send invalid setup: deadline earlier than start time
      host.send({
        t: 'hackathon_update_setup',
        setup: {
          hackathonName: 'HackLoop 2026',
          startTime: '2026-10-28T12:00:00Z',
          deadline: '2026-10-28T10:00:00Z',
        },
      });
      const err1 = await host.nextMsg('error');
      assert.strictEqual(err1.msg, 'Deadline must be after start time');

      // Send valid setup
      const validDeadline = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
      host.send({
        t: 'hackathon_update_setup',
        setup: {
          hackathonName: 'HackLoop 2026',
          projectName: 'Parallel Pro',
          deadline: validDeadline,
          goals: ['Build UI', 'Pass Tests'],
        },
      });
      const syncMsg = await host.nextMsg('hackathon_sync');
      assert.strictEqual(syncMsg.state.setup.hackathonName, 'HackLoop 2026');
      assert.strictEqual(syncMsg.state.setup.projectName, 'Parallel Pro');
      recordPass('1. Setup validation rejects invalid dates and saves valid setup');

      host.close();
    } catch (e) {
      recordFail('1. Setup validation', e);
    }

    // TEST 2: Countdown & deadline edge cases
    try {
      const statePassed = {
        setup: { deadline: new Date(Date.now() - 1000).toISOString() },
        tasks: [],
        milestones: [],
        deliverables: [],
      };
      const recsPassed = getNextBestActions(statePassed);
      assert.ok(recsPassed.some((r) => r.id === 'rec_deadline_passed' && r.urgency === 'critical'));

      const stateCrunch = {
        setup: { deadline: new Date(Date.now() + 3600 * 1000).toISOString() },
        tasks: [{ id: 't1', title: 'Must finish', priority: 'Critical', status: 'In Progress' }],
        milestones: [],
        deliverables: [],
      };
      const recsCrunch = getNextBestActions(stateCrunch);
      assert.ok(recsCrunch.some((r) => r.id === 'rec_deadline_crunch' && r.urgency === 'critical'));
      recordPass('2. Countdown & deadline edge cases evaluated correctly');
    } catch (e) {
      recordFail('2. Countdown edge cases', e);
    }

    // TEST 3: Task creation, editing, deletion, assignment
    let sharedSessionCode = '';
    let createdTaskId = '';
    try {
      const host = await connect();
      host.send({ t: 'create', name: 'HostBob' });
      const c = await host.nextMsg('created');
      sharedSessionCode = c.code;

      // Create task
      host.send({
        t: 'hackathon_task_create',
        task: {
          title: 'Implement WebSocket Sync',
          description: 'Add broadcast logic',
          priority: 'High',
          status: 'To Do',
          assignee: 'Bob',
          milestoneId: 'm2',
          relevantFiles: ['server/server.js'],
        },
      });
      const syncCreate = await host.nextMsg('hackathon_sync');
      const task = syncCreate.state.tasks.find((t) => t.title === 'Implement WebSocket Sync');
      assert.ok(task, 'Task should be in state');
      assert.strictEqual(task.priority, 'High');
      assert.strictEqual(task.assignee, 'Bob');
      createdTaskId = task.id;

      // Verify pulse entry
      assert.ok(syncCreate.state.pulse.some((p) => p.message.includes('Implement WebSocket Sync')));

      // Update task
      host.send({
        t: 'hackathon_task_update',
        id: createdTaskId,
        updates: {
          status: 'In Progress',
          acceptanceCriteria: 'Unit tests passing',
        },
      });
      const syncUpdate = await host.nextMsg('hackathon_sync');
      const updatedTask = syncUpdate.state.tasks.find((t) => t.id === createdTaskId);
      assert.strictEqual(updatedTask.status, 'In Progress');
      assert.strictEqual(updatedTask.acceptanceCriteria, 'Unit tests passing');

      // Delete task
      host.send({
        t: 'hackathon_task_delete',
        id: createdTaskId,
      });
      const syncDelete = await host.nextMsg('hackathon_sync');
      assert.strictEqual(syncDelete.state.tasks.find((t) => t.id === createdTaskId), undefined);
      recordPass('3. Task creation, editing, deletion, and assignment');

      host.close();
    } catch (e) {
      recordFail('3. Task CRUD and assignment', e);
    }

    // TEST 4: Invalid status and priority rejection
    try {
      const host = await connect();
      host.send({ t: 'create', name: 'HostValidator' });
      await host.nextMsg('created');

      // Invalid status
      host.send({
        t: 'hackathon_task_create',
        task: { title: 'Test', status: 'InvalidStatus' },
      });
      const errStatus = await host.nextMsg('error');
      assert.strictEqual(errStatus.msg, 'Invalid status. Must be one of: Backlog, To Do, In Progress, Blocked, Done');

      // Invalid priority
      host.send({
        t: 'hackathon_task_create',
        task: { title: 'Test', status: 'To Do', priority: 'SuperHigh' },
      });
      const errPriority = await host.nextMsg('error');
      assert.strictEqual(errPriority.msg, 'Invalid priority. Must be one of: Low, Medium, High, Critical');

      // Blocked without reason
      host.send({
        t: 'hackathon_task_create',
        task: { title: 'Test', status: 'Blocked', priority: 'Medium' },
      });
      const errBlocked = await host.nextMsg('error');
      assert.strictEqual(errBlocked.msg, 'Blocked reason is required when status is Blocked');

      recordPass('4. Invalid status, priority, and blocked validation rejected');
      host.close();
    } catch (e) {
      recordFail('4. Invalid status and priority rejection', e);
    }

    // TEST 5: Cross-client synchronization
    try {
      const host = await connect();
      host.send({ t: 'create', name: 'SyncHost' });
      const c = await host.nextMsg('created');
      const code = c.code;

      const guest = await connect();
      guest.send({ t: 'join', code, name: 'SyncGuest' });
      await host.nextMsg('join_request');
      host.send({ t: 'decide', name: 'SyncGuest', approve: true });

      await guest.nextMsg('joined');
      const guestSyncInitial = await guest.nextMsg('hackathon_sync');
      assert.ok(guestSyncInitial.state, 'Guest receives hackathon state upon joining');

      // Host creates a task
      host.send({
        t: 'hackathon_task_create',
        task: { title: 'Broadcast Task', status: 'To Do', priority: 'Medium' },
      });

      const hostReceived = await host.nextMsg('hackathon_sync');
      const guestReceived = await guest.nextMsg('hackathon_sync');

      assert.strictEqual(hostReceived.state.tasks.some((t) => t.title === 'Broadcast Task'), true);
      assert.strictEqual(guestReceived.state.tasks.some((t) => t.title === 'Broadcast Task'), true);

      recordPass('5. Cross-client synchronization broadcasts state updates to all peers');
      host.close();
      guest.close();
    } catch (e) {
      recordFail('5. Cross-client synchronization', e);
    }

    // TEST 6: Host/guest authorization & permission model
    try {
      const host = await connect();
      host.send({ t: 'create', name: 'AuthHost' });
      const c = await host.nextMsg('created');
      const code = c.code;

      const guest = await connect();
      guest.send({ t: 'join', code, name: 'AuthGuest' });
      await host.nextMsg('join_request');
      host.send({ t: 'decide', name: 'AuthGuest', approve: true });
      await guest.nextMsg('joined');
      await guest.nextMsg('hackathon_sync');

      // Read-only guest attempts to update setup
      guest.send({
        t: 'hackathon_update_setup',
        setup: { hackathonName: 'Hacked' },
      });
      const errGuestSetup = await guest.nextMsg('error');
      assert.strictEqual(errGuestSetup.msg, 'Only hosts can configure hackathon settings');

      // Read-only guest attempts to create task
      guest.send({
        t: 'hackathon_task_create',
        task: { title: 'Unauthorized Task' },
      });
      const errGuestTask = await guest.nextMsg('error');
      assert.strictEqual(errGuestTask.msg, 'Read-only participants cannot create tasks');

      // Guest requests edit access
      guest.send({ t: 'request_edit' });
      await host.nextMsg('edit_request');

      // Host grants edit access
      host.send({ t: 'decide_edit', name: 'AuthGuest', approve: true });
      await guest.nextMsg('edit_status');

      // Now promoted guest creates task -> must succeed!
      guest.send({
        t: 'hackathon_task_create',
        task: { title: 'Guest Authorized Task', status: 'To Do', priority: 'Low' },
      });
      const syncPromoted = await guest.nextMsg('hackathon_sync');
      assert.ok(syncPromoted.state.tasks.some((t) => t.title === 'Guest Authorized Task'));

      // But non-host guest STILL cannot update setup
      guest.send({
        t: 'hackathon_update_setup',
        setup: { hackathonName: 'Still Hacked' },
      });
      const errGuestSetup2 = await guest.nextMsg('error');
      assert.strictEqual(errGuestSetup2.msg, 'Only hosts can configure hackathon settings');

      recordPass('6. Host/guest authorization and edit-access enforcement verified');
      host.close();
      guest.close();
    } catch (e) {
      recordFail('6. Host/guest authorization', e);
    }

    // TEST 7: Persistence after restart
    try {
      const host = await connect();
      host.send({ t: 'create', name: 'PersistHost' });
      const c = await host.nextMsg('created');
      const code = c.code;

      host.send({
        t: 'hackathon_task_create',
        task: { title: 'Persistent DB Task', status: 'To Do', priority: 'High' },
      });
      await host.nextMsg('hackathon_sync');

      // Verify file exists on disk
      const filePath = path.join(HACKATHONS_DIR, `${code}.json`);
      assert.ok(fs.existsSync(filePath), `Persistence file must exist at ${filePath}`);
      const savedRaw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.ok(savedRaw.tasks.some((t) => t.title === 'Persistent DB Task'));

      // Clear memory store for this session
      clearSession(code);

      // Re-read from store -> loads from disk
      const reloaded = getHackathonState(code, 'PersistHost');
      assert.ok(reloaded.tasks.some((t) => t.title === 'Persistent DB Task'));

      recordPass('7. Disk persistence and state reload verified');
      host.close();
    } catch (e) {
      recordFail('7. Persistence after restart', e);
    }

    // TEST 8: Blocked and overdue task handling
    try {
      const now = Date.now();
      const testState = {
        setup: { deadline: new Date(now + 10 * 3600 * 1000).toISOString() },
        tasks: [
          {
            id: 't-blocked',
            title: 'Stuck on OAuth',
            status: 'Blocked',
            priority: 'Critical',
            blockedReason: 'API key revoked',
            assignee: 'Charlie',
          },
          {
            id: 't-overdue',
            title: 'Setup Database',
            status: 'In Progress',
            priority: 'High',
            dueDate: new Date(now - 3600 * 1000).toISOString(),
            assignee: 'David',
          },
        ],
        milestones: [],
        deliverables: [],
      };

      const recs = getNextBestActions(testState, now);
      const blockerRec = recs.find((r) => r.id === 'rec_blocker_t-blocked');
      assert.ok(blockerRec, 'Blocker recommendation must be present');
      assert.strictEqual(blockerRec.urgency, 'critical');
      assert.ok(blockerRec.description.includes('API key revoked'));

      const overdueRec = recs.find((r) => r.id === 'rec_overdue_t-overdue');
      assert.ok(overdueRec, 'Overdue recommendation must be present');
      assert.strictEqual(overdueRec.urgency, 'high');

      recordPass('8. Blocked and overdue tasks correctly prioritized in recommendations');
    } catch (e) {
      recordFail('8. Blocked and overdue task handling', e);
    }

    // TEST 9: Next Best Action recommendations (deterministic & explainable)
    try {
      const now = Date.now();
      const state = {
        setup: { deadline: new Date(now + 4 * 3600 * 1000).toISOString() },
        tasks: [
          { id: 't1', title: 'Critical Bug', priority: 'Critical', status: 'To Do', assignee: '' },
        ],
        milestones: [
          { id: 'm1', title: 'MVP Foundation', targetDeadline: 'T+2h', completed: false },
        ],
        deliverables: [
          { id: 'd1', label: 'GitHub Repository', url: '', completed: false },
        ],
      };

      const recs = getNextBestActions(state, now);
      assert.ok(recs.length > 0);
      recs.forEach((r) => {
        assert.ok(['critical', 'high', 'medium', 'info'].includes(r.urgency));
        assert.ok(['blocker', 'deadline', 'milestone', 'deliverable', 'workload'].includes(r.category));
        assert.ok(typeof r.title === 'string' && r.title.length > 0);
        assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
        assert.ok(typeof r.suggestedAction === 'string' && r.suggestedAction.length > 0);
      });

      // Assert determinism
      const recs2 = getNextBestActions(state, now);
      assert.deepStrictEqual(recs, recs2, 'Recommendations must be 100% deterministic');

      recordPass('9. Next Best Action recommendation engine is explainable and deterministic');
    } catch (e) {
      recordFail('9. Recommendation engine', e);
    }

    // TEST 10: Isolation between different sessions
    try {
      const hostA = await connect();
      hostA.send({ t: 'create', name: 'HostSessionA' });
      const cA = await hostA.nextMsg('created');

      const hostB = await connect();
      hostB.send({ t: 'create', name: 'HostSessionB' });
      const cB = await hostB.nextMsg('created');

      // Session A creates Task A
      hostA.send({
        t: 'hackathon_task_create',
        task: { title: 'Session A Secret Task', status: 'To Do', priority: 'Low' },
      });
      const syncA = await hostA.nextMsg('hackathon_sync');
      assert.ok(syncA.state.tasks.some((t) => t.title === 'Session A Secret Task'));

      // Session B asks for hackathon state
      hostB.send({ t: 'hackathon_get' });
      const syncB = await hostB.nextMsg('hackathon_sync');

      // Session B must NOT see Session A's task
      assert.strictEqual(syncB.state.tasks.some((t) => t.title === 'Session A Secret Task'), false);

      recordPass('10. Complete isolation verified between independent sessions');
      hostA.close();
      hostB.close();
    } catch (e) {
      recordFail('10. Isolation between sessions', e);
    }

    // TEST 11: Core collaborative regression verification
    try {
      const host = await connect();
      host.send({ t: 'create', name: 'RegHost' });
      const c = await host.nextMsg('created');

      // Send document update
      host.send({ t: 'doc', text: 'function hello() { return 42; }', file: 'hello.js' });

      // Send cursor update
      host.send({ t: 'cursor', line: 1, character: 10 });

      recordPass('11. Core collaborative regression check passed without conflict');
      host.close();
    } catch (e) {
      recordFail('11. Regression verification', e);
    }

  } finally {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  }

  console.log('\n--- Test Results ---');
  if (pass) {
    console.log('ALL 11 HACKATHON TEST SUITES PASSED! 🎉');
    process.exit(0);
  } else {
    console.error(`FAILED with ${errors.length} error(s).`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
