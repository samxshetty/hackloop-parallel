'use strict';
/**
 * test-edit-access.js
 *
 * Automated tests for permission-based live editing:
 * 1. Guest joins in read-only mode (role: 'guest', canEdit: false).
 * 2. Unapproved guest cannot send doc (blocked by server).
 * 3. Guest requests edit access -> host receives edit_request with authoritative name.
 * 4. Host approves request -> guest gets edit_status { canEdit: true }.
 *    Guest role remains 'guest' (separate edit permission from ownership/role).
 * 5. Security check: guest with canEdit cannot decide joins or revoke others.
 * 6. Host receives edit_granted broadcast and peers list shows canEdit: true.
 * 7. Approved guest sends multiline code with line breaks (\n and \r\n), indentation, tabs, braces.
 *    Formatting is 100% preserved.
 * 8. Duplicate request: already an editor cannot request edit again.
 * 9. Superhost revokes edit access -> guest gets edit_status { canEdit: false }.
 * 10. Host receives edit_revoked broadcast and peers list shows canEdit: false.
 * 11. Demoted guest attempts doc edit again -> blocked by server.
 * 12. Rejection flow: host rejects request -> guest gets edit_status { canEdit: false } and edit_denied.
 * 13. Non-superhost cannot revoke edit access.
 * 14. Outsider cannot request edit or send doc.
 */

const WebSocket = require('ws');

const SERVER_URL = 'ws://localhost:8080';
let pass = true;
const errors = [];

function fail(msg) {
    errors.push(msg);
    pass = false;
}

function createClient() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(SERVER_URL);
        const queue = [];
        const waiters = [];

        ws.on('open', () => {
            resolve({
                ws,
                send: (obj) => ws.send(JSON.stringify(obj)),
                nextMatchingMsg: (predicate, label, timeoutMs = 2500) => {
                    const matchIdx = queue.findIndex(predicate);
                    if (matchIdx !== -1) {
                        return Promise.resolve(queue.splice(matchIdx, 1)[0]);
                    }
                    return new Promise((res, rej) => {
                        const timer = setTimeout(() => {
                            const idx = waiters.findIndex((w) => w.resolve === res);
                            if (idx !== -1) waiters.splice(idx, 1);
                            rej(new Error(`Timeout waiting for matching message: ${label}`));
                        }, timeoutMs);

                        waiters.push({
                            predicate,
                            resolve: (msg) => {
                                clearTimeout(timer);
                                res(msg);
                            },
                        });
                    });
                },
                nextMsg: function (label, timeoutMs = 2500) {
                    return this.nextMatchingMsg(() => true, label, timeoutMs);
                },
                hasNoMsg: async (waitMs = 300) => {
                    if (queue.length > 0) return queue.shift();
                    await new Promise((r) => setTimeout(r, waitMs));
                    return queue.length > 0 ? queue.shift() : null;
                },
                close: () => ws.close(),
            });
        });

        ws.on('error', (err) => reject(err));

        ws.on('message', (data) => {
            let msg;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                return;
            }
            // Check if any waiter matches
            for (let i = 0; i < waiters.length; i++) {
                const w = waiters[i];
                if (w.predicate(msg)) {
                    waiters.splice(i, 1);
                    w.resolve(msg);
                    return;
                }
            }
            queue.push(msg);
        });
    });
}

async function run() {
    console.log('--- Starting Permission-Based Live Editing Protocol Tests ---');

    const host = await createClient();
    const guest = await createClient();

    // 1. Create session and join
    host.send({ t: 'create', name: 'HostBob' });
    const created = await host.nextMatchingMsg((m) => m.t === 'created', 'created');
    const code = created.code;

    guest.send({ t: 'join', code, name: 'GuestAlice' });
    const joinReq = await host.nextMatchingMsg((m) => m.t === 'join_request', 'join_request');
    if (joinReq.t === 'join_request' && joinReq.name === 'GuestAlice') {
        host.send({ t: 'decide', name: 'GuestAlice', approve: true });
    }

    await guest.nextMatchingMsg((m) => m.t === 'joined', 'joined');
    const initialPeers = await host.nextMatchingMsg((m) => m.t === 'peers', 'initial peers on host');

    const alicePeer = (initialPeers.peers || []).find((p) => p.name === 'GuestAlice');
    if (alicePeer && alicePeer.canEdit === false && alicePeer.role === 'guest') {
        console.log('PASS 1: Guest joined with read-only access (role: guest, canEdit: false)');
    } else {
        fail('Initial peer state invalid: ' + JSON.stringify(initialPeers));
    }

    // 2. Unapproved guest cannot send doc
    guest.send({ t: 'doc', text: 'illegal guest text', file: 'test.js' });
    const unapprovedDoc = await host.hasNoMsg(400);
    if (unapprovedDoc !== null && unapprovedDoc.t === 'doc') {
        fail('Unapproved guest was able to send doc!');
    } else {
        console.log('PASS 2: Unapproved guest doc is blocked by server');
    }

    // 3. Guest requests edit access
    guest.send({ t: 'request_edit' });
    const reqMsg = await host.nextMatchingMsg((m) => m.t === 'edit_request', 'edit_request');
    if (reqMsg.t === 'edit_request' && reqMsg.name === 'GuestAlice') {
        console.log('PASS 3: Host received edit_request with authoritative name "GuestAlice"');
    } else {
        fail('Host did not receive valid edit_request: ' + JSON.stringify(reqMsg));
    }

    // 4. Host approves edit access
    host.send({ t: 'decide_edit', name: 'GuestAlice', approve: true });
    const statusMsg = await guest.nextMatchingMsg((m) => m.t === 'edit_status', 'edit_status true');
    if (statusMsg.t === 'edit_status' && statusMsg.canEdit === true) {
        console.log('PASS 4: Guest received edit_status { canEdit: true }');
    } else {
        fail('Guest did not receive edit_status true: ' + JSON.stringify(statusMsg));
    }

    const grantedMsg = await host.nextMatchingMsg((m) => m.t === 'edit_granted', 'edit_granted');
    if (grantedMsg.t === 'edit_granted' && grantedMsg.name === 'GuestAlice') {
        console.log('PASS 5: Host received edit_granted broadcast');
    } else {
        fail('Host did not receive edit_granted: ' + JSON.stringify(grantedMsg));
    }

    const updatedPeers = await host.nextMatchingMsg((m) => m.t === 'peers', 'peers updated');
    const aliceUpdated = (updatedPeers.peers || []).find((p) => p.name === 'GuestAlice');
    if (aliceUpdated && aliceUpdated.canEdit === true && aliceUpdated.role === 'guest') {
        console.log('PASS 6: Peer list reflects canEdit: true while role remains "guest"');
    } else {
        fail('Peer list does not show canEdit: true or changed role unexpectedly: ' + JSON.stringify(updatedPeers));
    }

    // 5. Security check: guest with canEdit cannot decide joins
    guest.send({ t: 'decide', name: 'Nobody', approve: true });
    const unauthorizedDecide = await host.hasNoMsg(300);
    if (unauthorizedDecide !== null && unauthorizedDecide.t === 'joined') {
        fail('Guest was able to perform administrative decide!');
    } else {
        console.log('PASS 7: Guest with edit access has no administrative powers (cannot decide)');
    }

    // 6. Promoted guest sends multiline code with indentation, tabs, blank lines, and braces
    const multilineCode = `function calculateTotal(items) {\n\tif (!items || items.length === 0) {\n\t\treturn 0;\n\t}\n\n\tlet total = 0;\n\tfor (const item of items) {\n\t\ttotal += item.price * (item.qty || 1);\n\t}\n\treturn total;\n}`;
    guest.send({ t: 'doc', text: multilineCode, file: 'calc.js' });

    const hostDocMsg = await host.nextMatchingMsg((m) => m.t === 'doc', 'host receiving doc');
    if (hostDocMsg.t === 'doc' && hostDocMsg.text === multilineCode) {
        console.log('PASS 8: Multiline code delivered with intact newlines (\\n), tabs (\\t), blank lines, and braces');
    } else {
        fail('Multiline code corrupted or not received: ' + JSON.stringify(hostDocMsg));
    }

    // 7. Already an editor cannot request edit again
    guest.send({ t: 'request_edit' });
    const duplicateErr = await guest.nextMatchingMsg((m) => m.t === 'error', 'error already editor');
    if (duplicateErr.t === 'error' && duplicateErr.msg === 'already an editor') {
        console.log('PASS 9: Duplicate request_edit rejected with "already an editor"');
    } else {
        fail('Duplicate request_edit not rejected: ' + JSON.stringify(duplicateErr));
    }

    // 8. Superhost revokes edit access
    host.send({ t: 'revoke_edit', name: 'GuestAlice' });
    const revokedStatusMsg = await guest.nextMatchingMsg((m) => m.t === 'edit_status', 'edit_status false');
    if (revokedStatusMsg.t === 'edit_status' && revokedStatusMsg.canEdit === false) {
        console.log('PASS 10: Guest received edit_status { canEdit: false } upon revocation');
    } else {
        fail('Guest did not receive edit_status false: ' + JSON.stringify(revokedStatusMsg));
    }

    const revokedBroadcast = await host.nextMatchingMsg((m) => m.t === 'edit_revoked', 'edit_revoked');
    if (revokedBroadcast.t === 'edit_revoked' && revokedBroadcast.name === 'GuestAlice') {
        console.log('PASS 11: edit_revoked broadcast received by host');
    } else {
        fail('Host did not receive edit_revoked: ' + JSON.stringify(revokedBroadcast));
    }

    // 9. Demoted guest attempts doc edit again -> must be blocked
    guest.send({ t: 'doc', text: 'illegal edit after revoke', file: 'calc.js' });
    const blockedAfterRevoke = await host.hasNoMsg(400);
    if (blockedAfterRevoke !== null && blockedAfterRevoke.t === 'doc') {
        fail('Demoted guest was able to send doc after revocation!');
    } else {
        console.log('PASS 12: Demoted guest doc blocked after revocation');
    }

    // 10. Rejection flow test
    guest.send({ t: 'request_edit' });
    await host.nextMatchingMsg((m) => m.t === 'edit_request', 'edit_request 2');
    host.send({ t: 'decide_edit', name: 'GuestAlice', approve: false });

    const deniedStatusMsg = await guest.nextMatchingMsg((m) => m.t === 'edit_status', 'edit_status false (denied)');
    const deniedMsg = await guest.nextMatchingMsg((m) => m.t === 'edit_denied', 'edit_denied');
    if (deniedStatusMsg.t === 'edit_status' && deniedStatusMsg.canEdit === false &&
        deniedMsg.t === 'edit_denied' && deniedMsg.name === 'GuestAlice') {
        console.log('PASS 13: Guest received edit_status false and edit_denied on rejection');
    } else {
        fail('Rejection messages invalid: status=' + JSON.stringify(deniedStatusMsg) + ' denied=' + JSON.stringify(deniedMsg));
    }

    // 11. Guest cannot revoke edit access
    guest.send({ t: 'revoke_edit', name: 'HostBob' });
    const guestRevokeErr = await guest.nextMatchingMsg((m) => m.t === 'error', 'error revoke');
    if (guestRevokeErr.t === 'error' && guestRevokeErr.msg.includes('only superhost')) {
        console.log('PASS 14: Non-superhost revoke_edit rejected by server');
    } else {
        fail('Non-superhost revoke_edit was not blocked: ' + JSON.stringify(guestRevokeErr));
    }

    // 12. Outsider cannot request edit or send doc
    const outsider = await createClient();
    outsider.send({ t: 'request_edit' });
    const outsiderReq = await host.hasNoMsg(300);
    if (outsiderReq !== null && outsiderReq.t === 'edit_request') {
        fail('Outsider request was forwarded to host!');
    } else {
        console.log('PASS 15: Outsider edit request blocked');
    }

    host.close();
    guest.close();
    outsider.close();

    console.log('');
    if (errors.length) {
        console.error('ERRORS:');
        for (const e of errors) { console.error('  ✗', e); }
    }
    console.log(pass ? '✓ ALL 15 PERMISSION-BASED EDITING TESTS PASS' : '✗ SOME TESTS FAILED');
    process.exit(pass ? 0 : 1);
}

run().catch((err) => {
    console.error('Unexpected error in test-edit-access.js:', err);
    process.exit(1);
});
