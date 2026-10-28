'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  recordEdit,
  setRevoked,
  getContributions,
  notifyHost,
  clearSession,
} = require('./contributions');

describe('contributions', () => {
  beforeEach(() => {
    clearSession('TEST1');
    clearSession('TEST2');
  });

  test('credit only after accepted edits from approved editors', () => {
    const session = { code: 'TEST1', host: { code: 'TEST1', role: 'superhost', name: 'Alice' } };
    const guestEditor = { code: 'TEST1', role: 'guest', canEdit: true, name: 'Bob' };
    const sent = [];
    const fakeSend = (ws, msg) => sent.push({ ws, msg });

    recordEdit(session, guestEditor, 'hello', 'hello world', { oldStart: 5, oldEnd: 5, newMiddle: ' world' }, fakeSend);

    const contribs = getContributions(session);
    assert.equal(contribs.length, 1);
    assert.equal(contribs[0].name, 'Bob');
    assert.equal(contribs[0].edits, 1);
    assert.equal(contribs[0].lines, 1);
    assert.equal(contribs[0].revoked, false);
  });

  test('none for unapproved guests or hosts', () => {
    const session = { code: 'TEST1', host: { code: 'TEST1', role: 'superhost', name: 'Alice' } };
    const unapprovedGuest = { code: 'TEST1', role: 'guest', canEdit: false, name: 'Charlie' };
    const hostUser = { code: 'TEST1', role: 'superhost', canEdit: true, name: 'Alice' };
    const fakeSend = () => {};

    // Unapproved guest
    recordEdit(session, unapprovedGuest, 'a', 'b', null, fakeSend);
    assert.deepEqual(getContributions(session), []);

    // Host themselves
    recordEdit(session, hostUser, 'a', 'b', null, fakeSend);
    assert.deepEqual(getContributions(session), []);
  });

  test('no-op edits are ignored', () => {
    const session = { code: 'TEST1', host: { code: 'TEST1', role: 'superhost', name: 'Alice' } };
    const guestEditor = { code: 'TEST1', role: 'guest', canEdit: true, name: 'Bob' };
    const fakeSend = () => {};

    recordEdit(session, guestEditor, 'same text', 'same text', null, fakeSend);
    assert.deepEqual(getContributions(session), []);
  });

  test('bursts within 5 seconds coalesce into one edit count', () => {
    const session = { code: 'TEST1', host: { code: 'TEST1', role: 'superhost', name: 'Alice' } };
    const guestEditor = { code: 'TEST1', role: 'guest', canEdit: true, name: 'Bob' };
    const fakeSend = () => {};

    const realNow = Date.now;
    let fakeTime = 1000000;
    Date.now = () => fakeTime;

    try {
      // First edit
      recordEdit(session, guestEditor, 'line 1\n', 'line 1\nline 2\n', { oldStart: 7, oldEnd: 7, newMiddle: 'line 2\n' }, fakeSend);
      let list = getContributions(session);
      assert.equal(list[0].edits, 1);
      const lines1 = list[0].lines;

      // Burst edit 2 seconds later (within 5s)
      fakeTime += 2000;
      recordEdit(session, guestEditor, 'line 1\nline 2\n', 'line 1\nline 2\nline 3\n', { oldStart: 14, oldEnd: 14, newMiddle: 'line 3\n' }, fakeSend);
      list = getContributions(session);
      assert.equal(list[0].edits, 1, 'Burst edit within 5s should not increment edits count');
      assert.ok(list[0].lines > lines1, 'Lines changed should accumulate');

      // Edit 6 seconds later (outside 5s gap)
      fakeTime += 6000;
      recordEdit(session, guestEditor, 'line 1\nline 2\nline 3\n', 'line 1\nline 2\nline 3\nline 4\n', { oldStart: 21, oldEnd: 21, newMiddle: 'line 4\n' }, fakeSend);
      list = getContributions(session);
      assert.equal(list[0].edits, 2, 'Edit after >5s gap should increment edits count');
    } finally {
      Date.now = realNow;
    }
  });

  test('credit kept after revoke with revoked: true', () => {
    const session = { code: 'TEST1', host: { code: 'TEST1', role: 'superhost', name: 'Alice' } };
    const guestEditor = { code: 'TEST1', role: 'guest', canEdit: true, name: 'Bob' };
    const sent = [];
    const fakeSend = (ws, msg) => sent.push(msg);

    recordEdit(session, guestEditor, 'a', 'b', null, fakeSend);
    let list = getContributions(session);
    assert.equal(list[0].revoked, false);

    // Revoke
    setRevoked(session, 'Bob', true, fakeSend);
    list = getContributions(session);
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Bob');
    assert.equal(list[0].revoked, true);

    // Re-grant
    setRevoked(session, 'Bob', false, fakeSend);
    list = getContributions(session);
    assert.equal(list[0].revoked, false);
  });

  test('two sessions never mix', () => {
    const s1 = { code: 'TEST1', host: { code: 'TEST1', role: 'superhost', name: 'Alice' } };
    const s2 = { code: 'TEST2', host: { code: 'TEST2', role: 'superhost', name: 'Charlie' } };
    const g1 = { code: 'TEST1', role: 'guest', canEdit: true, name: 'Bob' };
    const g2 = { code: 'TEST2', role: 'guest', canEdit: true, name: 'Dana' };
    const fakeSend = () => {};

    recordEdit(s1, g1, 'x', 'y', null, fakeSend);
    recordEdit(s2, g2, 'foo', 'bar', null, fakeSend);

    const list1 = getContributions('TEST1');
    const list2 = getContributions('TEST2');

    assert.equal(list1.length, 1);
    assert.equal(list1[0].name, 'Bob');
    assert.equal(list2.length, 1);
    assert.equal(list2[0].name, 'Dana');
  });

  test('guest leaving mid-session does not clear contributions; clearSession does', () => {
    const session = { code: 'TEST1', host: { code: 'TEST1', role: 'superhost', name: 'Alice' } };
    const guest = { code: 'TEST1', role: 'guest', canEdit: true, name: 'Bob' };
    const fakeSend = () => {};

    recordEdit(session, guest, 'hello', 'world', null, fakeSend);
    assert.equal(getContributions('TEST1').length, 1);

    // Guest disconnects: session continues, contributions retained
    assert.equal(getContributions('TEST1').length, 1);

    // Host ends session: clearSession called
    clearSession('TEST1');
    assert.equal(getContributions('TEST1').length, 0);
  });
});
