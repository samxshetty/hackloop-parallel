import * as vscode from 'vscode';
import { connect, send, onMessage, disconnect, session, isEditor } from './connection';
import { registerSafetyStatus } from './safety/status';
import { registerCreditCommands } from './safety/credit';
import { registerSafetyLogger } from './safety/log';
import { registerReplayLoader } from './replay/loader';
import { AdminDashboardManager } from './dashboard/panel';
import { ParticipantsProvider } from './sidebar';
import { registerTerminal, closeTerminals } from './terminal';

const SCHEME = 'parallel';
const MAX_SHARE_BYTES = 4 * 1024 * 1024; // the server accepts up to 5 MB per message

// Read-only view (guests): the text being shown, its file name, and the tab address
let sharedText = '';
let sharedFile = 'shared.txt';
let sharedUri: vscode.Uri | undefined;
const sharedChanged = new vscode.EventEmitter<vscode.Uri>();

// Editor side (superhost and promoted hosts/editors): the file being shared
let hostDoc: vscode.TextDocument | undefined;
let hostFileName = 'shared.txt';
let sendTimer: NodeJS.Timeout | undefined;
let applyingRemote = false; // true while we write someone else's text into our file
let warnedTooBig = false;   // so the "file too large" warning shows once, not on every keystroke

// Latest list of participants (name, role, and canEdit), from the server's "peers" message
let lastPeers: { name: string; role: string; canEdit?: boolean }[] = [];

// False until the server accepts our create or join; used to leave cleanly on refusal
let joinedOk = false;

// Track whether this guest has a pending edit request awaiting host response
let pendingEditRequest = false;

// Set while an editable copy is being opened, so one promotion opens only one editor
let editorOpening: Promise<void> | undefined;

// Remote cursors: name -> position, and one decoration style per person
const cursors = new Map<string, { line: number; character: number }>();
const cursorTypes = new Map<string, vscode.TextEditorDecorationType>();
let cursorTimer: NodeJS.Timeout | undefined;

// Status bar: shows your role and the session code
const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

// Sidebar provider for the Participants tree view
const sidebar = new ParticipantsProvider();

function updateStatus(code?: string) {
    if (!session.role) {
        status.hide();
        return;
    }
    const editSuffix = session.role === 'guest' && session.canEdit ? ' (editor)' : '';
    status.text = `$(broadcast) Parallel: ${session.role}${editSuffix}` + (code ? ` · ${code}` : '');
    status.show();
}

// ---------- sharing the document ----------

function baseName(path: string): string {
    return path.split(/[\\/]/).pop() || 'shared.txt';
}

function languageFor(file: string): string | undefined {
    const ext = file.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
        js: 'javascript', ts: 'typescript', py: 'python', md: 'markdown',
        json: 'json', html: 'html', css: 'css', java: 'java', c: 'c', cpp: 'cpp',
    };
    return ext ? map[ext] : undefined;
}

// Is this document the shared file (our own copy, or the guest's read-only view)?
function isSharedDoc(doc: vscode.TextDocument): boolean {
    return doc === hostDoc ||
        (sharedUri !== undefined && doc.uri.toString() === sharedUri.toString());
}

// EDITOR: send the current text of the shared file
function sendDoc() {
    if (!hostDoc) {
        return;
    }
    const text = hostDoc.getText();
    // Too big: the server would cut the connection, so refuse to send instead
    if (Buffer.byteLength(text, 'utf8') > MAX_SHARE_BYTES) {
        if (!warnedTooBig) {
            warnedTooBig = true;
            vscode.window.showWarningMessage(
                'Parallel: this file is too large to share (over 4 MB). Changes are not being sent.');
        }
        return;
    }
    warnedTooBig = false;
    send({ t: 'doc', text, file: hostFileName });
}

// GUEST: show (or update) the read-only tab
async function showSharedDoc(text: string, file: string) {
    sharedText = text;
    sharedFile = file || sharedFile;
    if (!sharedUri) {
        sharedUri = vscode.Uri.from({ scheme: SCHEME, path: '/' + sharedFile });
        const doc = await vscode.workspace.openTextDocument(sharedUri);
        await vscode.window.showTextDocument(doc, { preview: false });
    } else {
        sharedChanged.fire(sharedUri);
    }
}

// EDITOR: write someone else's text into our file, changing only what differs
async function applyRemote(text: string) {
    sharedText = text;
    if (!hostDoc) {
        return;
    }
    const old = hostDoc.getText();
    if (old === text) {
        return;
    }

    // how many characters match at the start
    let start = 0;
    const shortest = Math.min(old.length, text.length);
    while (start < shortest && old[start] === text[start]) {
        start++;
    }

    // how many characters match at the end (without overlapping the start)
    let oldEnd = old.length;
    let newEnd = text.length;
    while (oldEnd > start && newEnd > start && old[oldEnd - 1] === text[newEnd - 1]) {
        oldEnd--;
        newEnd--;
    }

    clearTimeout(sendTimer);
    applyingRemote = true;
    try {
        const range = new vscode.Range(
            hostDoc.positionAt(start),
            hostDoc.positionAt(oldEnd));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(hostDoc.uri, range, text.slice(start, newEnd));
        await vscode.workspace.applyEdit(edit);
    } finally {
        applyingRemote = false;
    }
}

// Close every read-only "parallel:" tab, even when it is not the active one
async function closeReadOnlyTabs() {
    const tabs = vscode.window.tabGroups.all
        .flatMap((g) => g.tabs)
        .filter((t) => t.input instanceof vscode.TabInputText && t.input.uri.scheme === SCHEME);
    if (tabs.length > 0) {
        await vscode.window.tabGroups.close(tabs);
    }
}

async function openEditableCopy() {
    console.log(`[Parallel:becomeEditor] Opening editable document. Role=${session.role} lines=${sharedText.split('\n').length}`);
    await closeReadOnlyTabs();
    sharedUri = undefined;
    const doc = await vscode.workspace.openTextDocument({
        content: sharedText,
        language: languageFor(sharedFile),
    });
    hostDoc = doc;
    hostFileName = sharedFile;
    await vscode.window.showTextDocument(doc, { preview: false });
}

// PROMOTED GUEST: open an editable copy of the shared text and sync from it.
// The server sends both "role" and "edit_status" for one promotion, so this must be safe to call twice.
async function becomeEditor() {
    if (hostDoc && !hostDoc.isClosed) {
        return;
    }
    if (editorOpening) {
        return editorOpening;
    }
    editorOpening = openEditableCopy().finally(() => {
        editorOpening = undefined;
    });
    return editorOpening;
}

// REVOKED GUEST: close editable document if open and switch back to read-only virtual document
async function revokeLocalEditor() {
    const wasEditing = session.canEdit;
    session.canEdit = false;
    pendingEditRequest = false;
    updateStatus();
    if (wasEditing && session.role !== 'superhost') {
        const active = vscode.window.activeTextEditor;
        if (active && hostDoc && active.document === hostDoc) {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
        hostDoc = undefined;
        sharedUri = undefined;
        await showSharedDoc(sharedText, sharedFile);
        vscode.window.showInformationMessage('Your edit access has been revoked by the host.');
    }
}

// Forget everything about the shared file (session over)
function resetShared() {
    closeTerminals();
    sharedUri = undefined;
    sharedText = '';
    hostDoc = undefined;
    lastPeers = [];
    joinedOk = false;
    warnedTooBig = false;
    session.name = '';
    session.canEdit = false;
    pendingEditRequest = false;
    clearCursors();
    sidebar.setPeers([]);
}

// ---------- remote cursors ----------

// A stable color per name, so everyone sees the same color for the same person
function hueFor(name: string): number {
    let h = 0;
    for (const c of name) {
        h = (h * 31 + c.charCodeAt(0)) % 360;
    }
    return h;
}

function typeFor(name: string): vscode.TextEditorDecorationType {
    let t = cursorTypes.get(name);
    if (!t) {
        t = vscode.window.createTextEditorDecorationType({
            backgroundColor: `hsla(${hueFor(name)}, 80%, 55%, 0.35)`,
        });
        cursorTypes.set(name, t);
    }
    return t;
}

// Draw every remote cursor in every visible editor that shows the shared file
function repaintCursors() {
    for (const editor of vscode.window.visibleTextEditors) {
        if (!isSharedDoc(editor.document)) {
            continue;
        }
        for (const [name, c] of cursors) {
            const doc = editor.document;
            const start = doc.validatePosition(new vscode.Position(c.line, c.character));
            const end = doc.validatePosition(new vscode.Position(c.line, c.character + 1));
            editor.setDecorations(typeFor(name), [{
                range: new vscode.Range(start, end),
                renderOptions: {
                    after: {
                        contentText: ` ${name} `,
                        color: '#ffffff',
                        backgroundColor: `hsl(${hueFor(name)}, 70%, 40%)`,
                        margin: '0 0 0 2px',
                    },
                },
            }]);
        }
    }
}

function removeCursor(name: string) {
    cursors.delete(name);
    cursorTypes.get(name)?.dispose();
    cursorTypes.delete(name);
}

function clearCursors() {
    for (const name of [...cursors.keys()]) {
        removeCursor(name);
    }
}

// ---------- UI helpers ----------

async function showCode(code: string) {
    const pick = await vscode.window.showInformationMessage(
        `Session started! Your code is ${code}`, 'Copy code');
    if (pick === 'Copy code') {
        await vscode.env.clipboard.writeText(code);
    }
}

async function handleJoinRequest(name: string) {
    const pick = await vscode.window.showInformationMessage(
        `${name} wants to join`, 'Approve', 'Deny');
    if (!pick) {
        return; // popup dismissed: the guest keeps waiting
    }
    send({ t: 'decide', name, approve: pick === 'Approve' });
}

// Generates the HTML layout for the microphone test webview panel
function getMicTestHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Microphone Test</title>
    <style>
        body {
            font-family: var(--vscode-font-family, sans-serif);
            padding: 24px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            line-height: 1.5;
        }
        h2 {
            margin-top: 0;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            cursor: pointer;
            border-radius: 2px;
            font-size: 13px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        #status {
            margin-top: 16px;
            font-weight: 500;
        }
    </style>
</head>
<body>
    <h2>Microphone Spike Test</h2>
    <p>Test whether audio input (getUserMedia) works inside a VS Code webview.</p>
    <button id="test-mic-btn">Test microphone</button>
    <div id="status">Status: Ready to test microphone.</div>

    <script>
        const btn = document.getElementById('test-mic-btn');
        const statusEl = document.getElementById('status');

        btn.addEventListener('click', async () => {
            // Check if mediaDevices is supported in this browser context
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                statusEl.textContent = 'Error: navigator.mediaDevices.getUserMedia is undefined in this environment.';
                return;
            }

            statusEl.textContent = 'Requesting microphone permission...';

            try {
                // Request access to microphone audio stream
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

                // Success: report that microphone works
                statusEl.textContent = 'Microphone works';

                // Release microphone immediately by stopping all tracks
                stream.getTracks().forEach(track => track.stop());
            } catch (err) {
                // Failure: display exact error name and message (e.g. NotAllowedError)
                const errorName = err && err.name ? err.name : 'UnknownError';
                const errorMessage = err && err.message ? err.message : String(err);
                statusEl.textContent = 'Error [' + errorName + ']: ' + errorMessage;
            }
        });
    </script>
</body>
</html>`;
}

// ---------- activate ----------

export function activate(context: vscode.ExtensionContext) {
    registerSafetyStatus(context);
    registerCreditCommands(context);
    registerSafetyLogger(context);
    registerReplayLoader(context);
    AdminDashboardManager.getInstance().init(context);

    // Message handlers.
    onMessage('created', (msg) => {
        joinedOk = true;
        showCode(msg.code);
        sendDoc();
        updateStatus(msg.code);
    });
    onMessage('join_request', (msg) => handleJoinRequest(msg.name));
    onMessage('joined', (msg) => {
        joinedOk = true;
        vscode.window.showInformationMessage("You're in! The host approved you.");
        if (typeof msg.masked === 'number' && msg.masked > 0) {
            vscode.window.showInformationMessage("Some sensitive values are hidden by the host's safety filter.");
        }
        updateStatus();
    });
    onMessage('denied', () => {
        vscode.window.showWarningMessage('The host denied your request.');
        session.role = undefined;
        updateStatus();
        resetShared();
        disconnect();
    });
    onMessage('peers', (msg) => {
        lastPeers = msg.peers ??
            (msg.list ?? []).map((n: string) => ({ name: n, role: 'guest', canEdit: false }));
        sidebar.setPeers(lastPeers);
        console.log('peers:', lastPeers);
        sendDoc(); // editors re-send so late joiners and demoted people see the file
    });
    onMessage('doc', (msg) => {
        if (isEditor()) {
            applyRemote(msg.text).then(repaintCursors); // another editor changed the file
        } else {
            showSharedDoc(msg.text, msg.file);
            setTimeout(repaintCursors, 100);
        }
    });
    onMessage('cursor', (msg) => {
        cursors.set(msg.name, { line: msg.line, character: msg.character });
        repaintCursors();
    });
    onMessage('cursor_gone', (msg) => removeCursor(msg.name));

    // Session host receives edit request from a guest
    onMessage('edit_request', async (msg) => {
        if (session.role !== 'superhost') {
            return;
        }
        const pick = await vscode.window.showInformationMessage(
            msg.name + ' requested edit access.',
            'Approve',
            'Reject'
        );
        if (!pick) {
            return;
        }
        send({ t: 'decide_edit', name: msg.name, approve: pick === 'Approve' });
    });

    // Targeted message indicating updated edit permissions
    onMessage('edit_status', async (msg) => {
        pendingEditRequest = false;
        if (msg.canEdit) {
            session.canEdit = true;
            updateStatus();
            await becomeEditor();
            vscode.window.showInformationMessage('Edit access granted by host.');
        } else {
            await revokeLocalEditor();
        }
    });

    // Broadcast messages when edit status changes
    onMessage('edit_granted', (msg) => {
        if (session.name !== msg.name) {
            vscode.window.showInformationMessage('Edit access granted to ' + msg.name + '.');
        }
    });
    onMessage('edit_denied', (msg) => {
        pendingEditRequest = false;
        session.canEdit = false;
        updateStatus();
        if (session.name === msg.name) {
            vscode.window.showWarningMessage('The host rejected your edit access request.');
        }
    });
    onMessage('edit_revoked', (msg) => {
        if (session.name !== msg.name) {
            vscode.window.showInformationMessage('Edit access revoked for ' + msg.name + '.');
        }
    });

    onMessage('left', (msg) => {
        vscode.window.showInformationMessage(
            msg.pending
                ? `${msg.name} left before being approved.`
                : `${msg.name} left the session.`);
    });
    onMessage('role', async (msg) => {
        session.role = msg.role;
        updateStatus();
        vscode.window.showInformationMessage(`You are now a ${msg.role}.`);
        if (msg.role === 'host') {
            session.canEdit = true;
            await becomeEditor();
        } else if (msg.role === 'guest') {
            await revokeLocalEditor();
        }
    });
    onMessage('ended', () => {
        vscode.window.showInformationMessage('The host ended the session.');
        session.role = undefined;
        updateStatus();
        resetShared();
        disconnect();
    });
    onMessage('error', (msg) => {
        vscode.window.showWarningMessage('Server: ' + (msg.msg ?? msg.message));
        if (msg.fatal && session.role !== undefined && !joinedOk) {
            // our create or join was refused (bad code, name taken, expired...): leave cleanly.
            // Other errors (even while we wait for approval) must not kick us out.
            session.role = undefined;
            updateStatus();
            resetShared();
            disconnect();
        }
    });
    onMessage('closed', () => {
        if (session.role !== undefined) {
            vscode.window.showWarningMessage('Disconnected from the server.');
        }
        session.role = undefined;
        updateStatus();
        resetShared();
    });

    // SUPERHOST: start a session
    const start = vscode.commands.registerCommand('parallel.start', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Open the file you want to share first.');
            return;
        }
        const name = await vscode.window.showInputBox({ prompt: 'Your name (host)?' });
        if (!name || !name.trim()) {
            return;
        }
        // starting over: forget any earlier session in this window
        resetShared();
        session.role = undefined;
        try {
            await connect();
        } catch (err: any) {
            vscode.window.showErrorMessage(
                'Cannot reach the server: ' + (err?.code ?? err?.message ?? err));
            return;
        }
        session.role = 'superhost';
        session.canEdit = true;
        session.name = name.trim().slice(0, 30);
        hostDoc = editor.document;
        hostFileName = baseName(editor.document.fileName);
        send({ t: 'create', name: session.name });
    });

    // GUEST: join a session
    const join = vscode.commands.registerCommand('parallel.join', async () => {
        const code = await vscode.window.showInputBox({
            prompt: 'Session code',
            validateInput: (value) =>
                value.trim().length === 6 ? null : 'The code has 6 characters',
        });
        if (!code) {
            return;
        }
        const name = await vscode.window.showInputBox({ prompt: 'Your name?' });
        if (!name || !name.trim()) {
            return;
        }
        // starting over: forget any earlier session in this window
        resetShared();
        session.role = undefined;
        try {
            await connect();
        } catch (err: any) {
            vscode.window.showErrorMessage(
                'Cannot reach the server: ' + (err?.code ?? err?.message ?? err));
            return;
        }
        session.role = 'guest';
        session.canEdit = false;
        session.name = name.trim().slice(0, 30);
        send({ t: 'join', code: code.trim().toUpperCase(), name: session.name });
        vscode.window.showInformationMessage('Waiting for the host to approve you...');
    });

    // GUEST: request edit access from the host
    const requestEdit = vscode.commands.registerCommand('parallel.requestEditAccess', async () => {
        if (!session.role) {
            vscode.window.showErrorMessage('You are not in a Parallel session.');
            return;
        }
        if (isEditor()) {
            vscode.window.showInformationMessage('You already have edit access.');
            return;
        }
        if (pendingEditRequest) {
            vscode.window.showInformationMessage('Edit request already pending approval.');
            return;
        }
        pendingEditRequest = true;
        send({ t: 'request_edit' });
        vscode.window.showInformationMessage('Edit access requested from the host. Waiting for approval...');
    });

    // SUPERHOST: explicitly grant edit access to a guest
    const grantEdit = vscode.commands.registerCommand('parallel.grantEditAccess', async () => {
        if (session.role !== 'superhost') {
            vscode.window.showErrorMessage('Only the superhost can grant edit access.');
            return;
        }
        const guests = lastPeers.filter((p) => !p.canEdit && p.role !== 'superhost');
        if (guests.length === 0) {
            vscode.window.showInformationMessage('No guests with read-only access found.');
            return;
        }
        const who = await vscode.window.showQuickPick(
            guests.map((p) => ({ label: p.name })),
            { placeHolder: 'Select guest to grant edit access to' }
        );
        if (!who) {
            return;
        }
        send({ t: 'decide_edit', name: who.label, approve: true });
    });

    // SUPERHOST: revoke edit access from a participant who has edit permissions
    const revokeEdit = vscode.commands.registerCommand('parallel.revokeEditAccess', async () => {
        if (session.role !== 'superhost') {
            vscode.window.showErrorMessage('Only the superhost can revoke edit access.');
            return;
        }
        // hosts are demoted with Change Role, so only guests with edit access are listed here
        const editors = lastPeers.filter((p) => p.canEdit && p.role === 'guest');
        if (editors.length === 0) {
            vscode.window.showInformationMessage('No participants currently have edit access.');
            return;
        }
        const who = await vscode.window.showQuickPick(
            editors.map((p) => ({ label: p.name })),
            { placeHolder: 'Select editor to revoke edit access from' }
        );
        if (!who) {
            return;
        }
        send({ t: 'revoke_edit', name: who.label });
    });

    // SUPERHOST: promote or demote someone
    const changeRole = vscode.commands.registerCommand('parallel.changeRole', async () => {
        if (session.role !== 'superhost') {
            vscode.window.showErrorMessage('Only the super host can change roles.');
            return;
        }
        if (lastPeers.length === 0) {
            vscode.window.showInformationMessage('Nobody has joined yet.');
            return;
        }
        const who = await vscode.window.showQuickPick(
            lastPeers.map((p) => ({ label: p.name, description: p.role })),
            { placeHolder: 'Whose role do you want to change?' });
        if (!who) {
            return;
        }
        const role = await vscode.window.showQuickPick(['host', 'guest'],
            { placeHolder: `New role for ${who.label}` });
        if (!role) {
            return;
        }
        send({ t: 'role', name: who.label, role });
    });

    // MICROPHONE TEST (Person D spike)
    // Opens a Webview panel with a button and status area to test getUserMedia
    const micTest = vscode.commands.registerCommand('parallel.micTest', () => {
        // Create and show a new webview panel in the editor area
        const panel = vscode.window.createWebviewPanel(
            'parallel.micTest',       // Internal identifier for the panel
            'Microphone Test',         // Title displayed on the tab
            vscode.ViewColumn.One,     // Column in which to show the panel
            {
                enableScripts: true,   // Crucial: allows JavaScript execution in the webview
            }
        );

        // Set the webview HTML containing the button and status area
        panel.webview.html = getMicTestHtml();
    });

    // Jump editor view to a participant's last known cursor position
    const jumpToPerson = vscode.commands.registerCommand(
        'parallel.jumpToPerson',
        async (arg?: string | { name: string }) => {
            let targetName = typeof arg === 'string' ? arg : arg?.name;
            if (!targetName) {
                if (lastPeers.length === 0) {
                    vscode.window.showInformationMessage('No participants in the session.');
                    return;
                }
                const pick = await vscode.window.showQuickPick(
                    lastPeers.map((p) => p.name),
                    { placeHolder: 'Select a participant to jump to' }
                );
                if (!pick) {
                    return;
                }
                targetName = pick;
            }

            const pos = cursors.get(targetName);
            if (!pos) {
                vscode.window.showInformationMessage(`No cursor position for ${targetName} yet.`);
                return;
            }

            // Find visible editor showing the shared document
            const editor = (vscode.window.activeTextEditor && isSharedDoc(vscode.window.activeTextEditor.document))
                ? vscode.window.activeTextEditor
                : vscode.window.visibleTextEditors.find((e) => isSharedDoc(e.document));

            if (!editor) {
                vscode.window.showInformationMessage('The shared file is not open in an editor.');
                return;
            }

            const position = new vscode.Position(pos.line, pos.character);
            const range = new vscode.Range(position, position);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
    );

    // The read-only "parallel:" files
    const provider = vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
        onDidChange: sharedChanged.event,
        provideTextDocumentContent: () => sharedText,
    });

    // Editors: send the file whenever it changes (wait 100 ms after the last keystroke)
    const watcher = vscode.workspace.onDidChangeTextDocument((e) => {
        if (!isEditor() || e.document !== hostDoc || applyingRemote) {
            return;
        }
        clearTimeout(sendTimer);
        sendTimer = setTimeout(sendDoc, 100);
    });

    // Everyone: send my cursor position when it moves inside the shared file
    const selectionWatcher = vscode.window.onDidChangeTextEditorSelection((e) => {
        if (!session.role || !isSharedDoc(e.textEditor.document)) {
            return;
        }
        clearTimeout(cursorTimer);
        cursorTimer = setTimeout(() => {
            const p = e.selections[0].active;
            send({ t: 'cursor', line: p.line, character: p.character });
        }, 50);
    });

    // Redraw remote cursors when tabs open, close or move
    const visibleWatcher = vscode.window.onDidChangeVisibleTextEditors(() => repaintCursors());

    // ADMIN DASHBOARD: open dashboard webview
    const openDashboard = vscode.commands.registerCommand('parallel.openAdminDashboard', () => {
        AdminDashboardManager.getInstance().open(context);
    });

    const participantsView = vscode.window.registerTreeDataProvider('parallel.participants', sidebar);
    const terminalDisposables = registerTerminal();

    context.subscriptions.push(
        start, join, changeRole, requestEdit, grantEdit, revokeEdit, micTest, jumpToPerson, openDashboard, provider,
        watcher, selectionWatcher, visibleWatcher, status, participantsView, ...terminalDisposables);
}

export function deactivate() {
    closeTerminals();
    disconnect();
}
