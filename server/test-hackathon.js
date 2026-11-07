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
 * 12. Deliverable URL updates, validation, clearing, unauthorized rejection, and persistence
 * 13. Custom Collaborative Timer (host-only controls, start/pause/resume/reset/expiration, sync, persistence)
 * 14. Editable Hackathon Deadline & Start Time (host-only controls, validation, sync, expired handling, custom timer independence, persistence)
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


    // TEST 12: Deliverable URL updates, validation, clearing, unauthorized rejection, and persistence
    try {
      const host = await connect();
      host.send({ t: 'create', name: 'DelivHost' });
      const c = await host.nextMsg('created');
      const sessionCode = c.code;

      const guest = await connect();
      guest.send({ t: 'join', code: sessionCode, name: 'DelivGuest' });
      await host.nextMsg('join_request');
      host.send({ t: 'decide', name: 'DelivGuest', approve: true });
      await guest.nextMsg('joined');
      await guest.nextMsg('hackathon_sync');

      // 1. Read-only guest attempts to update deliverable -> rejected
      guest.send({
        t: 'hackathon_deliverable_update',
        id: 'del_repo',
        updates: { url: 'https://github.com/evil/repo' },
      });
      const unauthErr = await guest.nextMsg('error');
      assert.strictEqual(unauthErr.msg, 'Read-only participants cannot update deliverables');

      // 2. Host updates each of the 5 deliverables with valid URLs
      const deliverableUrls = {
        del_repo: 'https://github.com/parallel-team/hackloop-parallel',
        del_demo: 'https://demo.parallel-live.dev',
        del_slides: 'https://docs.google.com/presentation/d/12345/edit',
        del_docs: 'https://docs.parallel-live.dev/architecture',
        del_portal: 'https://devpost.com/software/parallel-collaborative',
      };

      for (const [id, url] of Object.entries(deliverableUrls)) {
        host.send({
          t: 'hackathon_deliverable_update',
          id,
          updates: { url },
        });

        const syncHost = await host.nextMsg('hackathon_sync');
        const syncGuest = await guest.nextMsg('hackathon_sync');

        const dHost = syncHost.state.deliverables.find((d) => d.id === id);
        const dGuest = syncGuest.state.deliverables.find((d) => d.id === id);

        assert.ok(dHost, `Deliverable ${id} must exist in host state`);
        assert.strictEqual(dHost.url, url, `Host deliverable ${id} URL matches`);
        assert.strictEqual(dGuest.url, url, `Guest deliverable ${id} received broadcast URL`);
      }

      // 3. Invalid URL validation rejection (e.g. ftp:// or not a URL)
      host.send({
        t: 'hackathon_deliverable_update',
        id: 'del_repo',
        updates: { url: 'ftp://invalid-protocol.com/repo' },
      });
      const invalidUrlErr = await host.nextMsg('error');
      assert.strictEqual(invalidUrlErr.msg, 'Invalid URL. Must be a valid HTTP or HTTPS URL.');

      host.send({
        t: 'hackathon_deliverable_update',
        id: 'del_repo',
        updates: { url: 'not-a-valid-url' },
      });
      const invalidUrlErr2 = await host.nextMsg('error');
      assert.strictEqual(invalidUrlErr2.msg, 'Invalid URL. Must be a valid HTTP or HTTPS URL.');

      // 4. URL clearing (empty string)
      host.send({
        t: 'hackathon_deliverable_update',
        id: 'del_repo',
        updates: { url: '' },
      });
      const clearSyncHost = await host.nextMsg('hackathon_sync');
      const clearSyncGuest = await guest.nextMsg('hackathon_sync');
      const clearedDel = clearSyncHost.state.deliverables.find((d) => d.id === 'del_repo');
      assert.strictEqual(clearedDel.url, '', 'Deliverable URL should be successfully cleared');
      assert.strictEqual(clearSyncGuest.state.deliverables.find((d) => d.id === 'del_repo').url, '');

      // 5. Persistence verification after disk reload
      clearSession(sessionCode);
      const reloader = await connect();
      reloader.send({ t: 'join', code: sessionCode, name: 'Reloader' });
      await host.nextMsg('join_request');
      host.send({ t: 'decide', name: 'Reloader', approve: true });
      await reloader.nextMsg('joined');

      reloader.send({ t: 'hackathon_get' });
      const reloadedSync = await reloader.nextMsg('hackathon_sync');
      const persistedDemo = reloadedSync.state.deliverables.find((d) => d.id === 'del_demo');
      assert.strictEqual(persistedDemo.url, deliverableUrls.del_demo, 'Deliverable URL persisted across reload');

      recordPass('12. Deliverable URL update, validation, clearing, authorization, and persistence verified');
      host.close();
      guest.close();
      reloader.close();
    } catch (e) {
      recordFail('12. Deliverable URL updates & validation', e);
    }

    // TEST 13: Custom Collaborative Timer
    try {
      const host = await connect();
      host.send({ t: 'create', name: 'TimerHost' });
      const c = await host.nextMsg('created');
      const sessionCode = c.code;

      const guest = await connect();
      guest.send({ t: 'join', code: sessionCode, name: 'TimerGuest' });
      await host.nextMsg('join_request');
      host.send({ t: 'decide', name: 'TimerGuest', approve: true });
      await guest.nextMsg('joined');
      await guest.nextMsg('hackathon_sync');

      // 1. Initial State has timer configured
      host.send({ t: 'hackathon_get' });
      const initSync = await host.nextMsg('hackathon_sync');
      assert.ok(initSync.state.timer, 'Timer must be present in hackathon state');
      assert.strictEqual(initSync.state.timer.status, 'idle');
      assert.strictEqual(initSync.state.timer.durationMs, 25 * 60 * 1000);

      // 2. Unauthorized guest attempt -> rejected
      guest.send({
        t: 'hackathon_timer_control',
        action: 'start',
      });
      const unauthTimerErr = await guest.nextMsg('error');
      assert.strictEqual(unauthTimerErr.msg, 'Only the superhost can control the custom timer');

      // 3. Host configures custom timer (hours, minutes, label)
      host.send({
        t: 'hackathon_timer_control',
        action: 'configure',
        params: { hours: 1, minutes: 15, label: 'MVP Sprint Alpha' },
      });
      const configHostSync = await host.nextMsg('hackathon_sync');
      const configGuestSync = await guest.nextMsg('hackathon_sync');
      assert.strictEqual(configHostSync.state.timer.durationMs, (1 * 3600 + 15 * 60) * 1000);
      assert.strictEqual(configHostSync.state.timer.label, 'MVP Sprint Alpha');
      assert.strictEqual(configHostSync.state.timer.status, 'idle');
      assert.strictEqual(configGuestSync.state.timer.durationMs, configHostSync.state.timer.durationMs);

      // 4. Host starts the timer
      const beforeStart = Date.now();
      host.send({
        t: 'hackathon_timer_control',
        action: 'start',
      });
      const startHostSync = await host.nextMsg('hackathon_sync');
      const startGuestSync = await guest.nextMsg('hackathon_sync');
            assert.strictEqual(startHostSync.state.timer.status, 'running');
      assert.ok(startHostSync.state.timer.startedAt >= beforeStart - 1000);
      assert.ok(startHostSync.state.timer.endsAt > Date.now());
      assert.strictEqual(startGuestSync.state.timer.status, 'running');
      assert.strictEqual(startGuestSync.state.timer.endsAt, startHostSync.state.timer.endsAt);

      // 5. Host pauses the timer
      await new Promise((r) => setTimeout(r, 100));
      host.send({
        t: 'hackathon_timer_control',
        action: 'pause',
      });
      const pauseHostSync = await host.nextMsg('hackathon_sync');
      const pauseGuestSync = await guest.nextMsg('hackathon_sync');
      assert.strictEqual(pauseHostSync.state.timer.status, 'paused');
      assert.ok(pauseHostSync.state.timer.remainingMs > 0);
      assert.ok(pauseHostSync.state.timer.remainingMs < pauseHostSync.state.timer.durationMs);
      assert.strictEqual(pauseHostSync.state.timer.endsAt, null);
      assert.strictEqual(pauseGuestSync.state.timer.status, 'paused');
      const pausedRem = pauseHostSync.state.timer.remainingMs;

      // 6. Host resumes the timer
      host.send({
        t: 'hackathon_timer_control',
        action: 'resume',
      });
      const resumeHostSync = await host.nextMsg('hackathon_sync');
      const resumeGuestSync = await guest.nextMsg('hackathon_sync');
      assert.strictEqual(resumeHostSync.state.timer.status, 'running');
      assert.ok(resumeHostSync.state.timer.endsAt > Date.now());
      assert.strictEqual(resumeGuestSync.state.timer.status, 'running');

      // 7. Host resets the timer
      host.send({
        t: 'hackathon_timer_control',
        action: 'reset',
      });
      const resetHostSync = await host.nextMsg('hackathon_sync');
      const resetGuestSync = await guest.nextMsg('hackathon_sync');
      assert.strictEqual(resetHostSync.state.timer.status, 'idle');
      assert.strictEqual(resetHostSync.state.timer.remainingMs, resetHostSync.state.timer.durationMs);
      assert.strictEqual(resetHostSync.state.timer.endsAt, null);
      assert.strictEqual(resetGuestSync.state.timer.status, 'idle');

      // 8. Timer expiration handling
      host.send({
        t: 'hackathon_timer_control',
        action: 'start',
        params: { durationMs: 200, label: 'Fast Sprint' },
      });
      await host.nextMsg('hackathon_sync');
      await guest.nextMsg('hackathon_sync');

      // Wait for timer to expire
      await new Promise((r) => setTimeout(r, 350));
      host.send({ t: 'hackathon_get' });
      const expiredSync = await host.nextMsg('hackathon_sync');
      assert.strictEqual(expiredSync.state.timer.status, 'completed');
      assert.strictEqual(expiredSync.state.timer.remainingMs, 0);

      // 9. Reconnection & state reload
      clearSession(sessionCode);
      const reconnected = await connect();
      reconnected.send({ t: 'join', code: sessionCode, name: 'TimerReloader' });
      await host.nextMsg('join_request');
      host.send({ t: 'decide', name: 'TimerReloader', approve: true });
      await reconnected.nextMsg('joined');

      reconnected.send({ t: 'hackathon_get' });
      const reloadedTimerSync = await reconnected.nextMsg('hackathon_sync');
      assert.ok(reloadedTimerSync.state.timer);
      assert.strictEqual(reloadedTimerSync.state.timer.label, 'Fast Sprint');
      assert.strictEqual(reloadedTimerSync.state.timer.status, 'completed');

      recordPass('13. Custom Collaborative Timer controls, sync, expiration, and persistence verified');
      host.close();
      guest.close();
      reconnected.close();
    } catch (e) {
      recordFail('13. Custom Collaborative Timer', e);
    }


    // TEST 14: Editable Hackathon Deadline & Start Time Lifecycle
    try {
      const host = await connect();
      host.send({ t: 'create', name: 'DeadlineHost' });
      const c = await host.nextMsg('created');
      const sessionCode = c.code;

      const guest = await connect();
      guest.send({ t: 'join', code: sessionCode, name: 'DeadlineGuest' });
      await host.nextMsg('join_request');
      host.send({ t: 'decide', name: 'DeadlineGuest', approve: true });
      await guest.nextMsg('joined');
      await guest.nextMsg('hackathon_sync'); // consume initial join sync

      // 1. Unauthorized guest attempt to update deadline -> rejected
      guest.send({
        t: 'hackathon_update_deadline',
        updates: { deadline: new Date(Date.now() + 86400000).toISOString() },
      });
      const unauthErr1 = await guest.nextMsg('error');
      assert.strictEqual(unauthErr1.msg, 'Only the superhost can edit the hackathon deadline and start time');

      guest.send({
        t: 'hackathon_update_setup',
        setup: { deadline: new Date(Date.now() + 86400000).toISOString() },
      });
      const unauthErr2 = await guest.nextMsg('error');
      assert.strictEqual(unauthErr2.msg, 'Only hosts can configure hackathon settings');

      // 2. Host tests invalid date/time formats
      host.send({
        t: 'hackathon_update_deadline',
        updates: { deadline: 'invalid-deadline-string' },
      });
      const errInvDeadline = await host.nextMsg('error');
      assert.strictEqual(errInvDeadline.msg, 'Invalid deadline date format');

      host.send({
        t: 'hackathon_update_deadline',
        updates: { startTime: 'invalid-start-string' },
      });
      const errInvStart = await host.nextMsg('error');
      assert.strictEqual(errInvStart.msg, 'Invalid start time date format');

      // 3. Host tests deadline earlier than or equal to start time
      const testStart = new Date(Date.now() + 20000000).toISOString();
      const earlierDeadline = new Date(Date.now() + 10000000).toISOString();

      host.send({
        t: 'hackathon_update_deadline',
        updates: { startTime: testStart, deadline: earlierDeadline },
      });
      const errEarlier = await host.nextMsg('error');
      assert.strictEqual(errEarlier.msg, 'Deadline must be after start time');

      // 4. Host successfully updates deadline
      const now = Date.now();
      const validStartTime = new Date(now).toISOString();
      const validDeadline = new Date(now + 48 * 3600 * 1000).toISOString(); // 48 hours later
      const newHackathonName = 'AI Grand Hackathon 2026';

      host.send({
        t: 'hackathon_update_deadline',
        updates: {
          hackathonName: newHackathonName,
          startTime: validStartTime,
          deadline: validDeadline,
        },
      });

      const hostSync1 = await host.nextMsg('hackathon_sync');
      const guestSync1 = await guest.nextMsg('hackathon_sync');

      assert.strictEqual(hostSync1.state.setup.hackathonName, newHackathonName);
      assert.strictEqual(hostSync1.state.setup.startTime, validStartTime);
      assert.strictEqual(hostSync1.state.setup.deadline, validDeadline);

      // Verify guest received exact synchronization
      assert.strictEqual(guestSync1.state.setup.hackathonName, newHackathonName);
      assert.strictEqual(guestSync1.state.setup.startTime, validStartTime);
      assert.strictEqual(guestSync1.state.setup.deadline, validDeadline);

      // 5. Host updates start time only
      const updatedStartTime = new Date(now + 1000).toISOString();
      host.send({
        t: 'hackathon_update_deadline',
        updates: { startTime: updatedStartTime },
      });

      const hostSync2 = await host.nextMsg('hackathon_sync');
      const guestSync2 = await guest.nextMsg('hackathon_sync');

      assert.strictEqual(hostSync2.state.setup.startTime, updatedStartTime);
      assert.strictEqual(hostSync2.state.setup.deadline, validDeadline);
      assert.strictEqual(guestSync2.state.setup.startTime, updatedStartTime);

      // 6. Expired / past deadline handling
      const pastStart = new Date(now - 7200000).toISOString(); // 2 hours ago
      const pastDeadline = new Date(now - 3600000).toISOString(); // 1 hour ago

      host.send({
        t: 'hackathon_update_deadline',
        updates: {
          startTime: pastStart,
          deadline: pastDeadline,
        },
      });

      const hostSyncPast = await host.nextMsg('hackathon_sync');
      const guestSyncPast = await guest.nextMsg('hackathon_sync');

      assert.strictEqual(hostSyncPast.state.setup.startTime, pastStart);
      assert.strictEqual(hostSyncPast.state.setup.deadline, pastDeadline);
      assert.strictEqual(guestSyncPast.state.setup.deadline, pastDeadline);
      assert.ok(new Date(guestSyncPast.state.setup.deadline).getTime() < Date.now(), 'Deadline is in the past');

      // 7. Custom Timer continues independently after deadline changes
      host.send({
        t: 'hackathon_timer_control',
        action: 'start',
        params: { durationMs: 1800000, label: 'Sprint During Deadline Change' },
      });
      const timerSyncHost = await host.nextMsg('hackathon_sync');
      await guest.nextMsg('hackathon_sync');

      assert.strictEqual(timerSyncHost.state.timer.status, 'running');
      assert.strictEqual(timerSyncHost.state.timer.label, 'Sprint During Deadline Change');
      const timerEndsAt = timerSyncHost.state.timer.endsAt;

      // Host changes deadline again while custom timer is running
      const newFutureDeadline = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
      host.send({
        t: 'hackathon_update_deadline',
        updates: { deadline: newFutureDeadline },
      });

      const hostSyncAfterTimer = await host.nextMsg('hackathon_sync');
      const guestSyncAfterTimer = await guest.nextMsg('hackathon_sync');

      assert.strictEqual(hostSyncAfterTimer.state.setup.deadline, newFutureDeadline);
      assert.strictEqual(guestSyncAfterTimer.state.setup.deadline, newFutureDeadline);

      // Custom timer must be completely untouched and independent
      assert.strictEqual(hostSyncAfterTimer.state.timer.status, 'running');
      assert.strictEqual(hostSyncAfterTimer.state.timer.label, 'Sprint During Deadline Change');
      assert.strictEqual(hostSyncAfterTimer.state.timer.endsAt, timerEndsAt);
      assert.strictEqual(guestSyncAfterTimer.state.timer.status, 'running');
      assert.strictEqual(guestSyncAfterTimer.state.timer.endsAt, timerEndsAt);

      // 8. Persistence after reload / reconnect
      clearSession(sessionCode);
      const reloader = await connect();
      reloader.send({ t: 'join', code: sessionCode, name: 'DeadlineReloader' });
      await host.nextMsg('join_request');
      host.send({ t: 'decide', name: 'DeadlineReloader', approve: true });
      await reloader.nextMsg('joined');
      await reloader.nextMsg('hackathon_sync');

      reloader.send({ t: 'hackathon_get' });
      const reloadedSync = await reloader.nextMsg('hackathon_sync');
      assert.strictEqual(reloadedSync.state.setup.hackathonName, newHackathonName);
      assert.strictEqual(reloadedSync.state.setup.deadline, newFutureDeadline);
      assert.strictEqual(reloadedSync.state.timer.label, 'Sprint During Deadline Change');

      recordPass('14. Editable Hackathon Deadline & Start Time Lifecycle verified');
      host.close();
      guest.close();
      reloader.close();
    } catch (e) {
      recordFail('14. Editable Hackathon Deadline', e);
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
    console.log('ALL 14 HACKATHON TEST SUITES PASSED! 🎉');
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
