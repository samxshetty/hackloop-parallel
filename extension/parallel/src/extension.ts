import * as vscode from 'vscode';
import { connect, send, onMessage, disconnect, session, isEditor } from './connection';
import { registerSafetyStatus } from './safety/status';

const SCHEME = 'parallel';
const MAX_SHARE_BYTES = 4 * 1024 * 1024; // the server accepts up to 5 MB per message

// Read-only view (guests): the text being shown, its file name, and the tab address
let sharedText = '';
let sharedFile = 'shared.txt';
let sharedUri: vscode.Uri | undefined;
const sharedChanged = new vscode.EventEmitter<vscode.Uri>();

// Editor side (superhost and promoted hosts): the file being shared
let hostDoc: vscode.TextDocument | undefined;
let hostFileName = 'shared.txt';
let sendTimer: NodeJS.Timeout | undefined;
let applyingRemote = false; // true while we write someone else's text into our file
let warnedTooBig = false;   // so the "file too large" warning shows once, not on every keystroke

// Latest list of participants (name and role), from the server's "peers" message
let lastPeers: { name: string; role: string }[] = [];

// False until the server accepts our create or join; used to leave cleanly on refusal
let joinedOk = false;

// Remote cursors: name -> position, and one decoration style per person
const cursors = new Map<string, { line: number; character: number }>();
const cursorTypes = new Map<string, vscode.TextEditorDecorationType>();
let cursorTimer: NodeJS.Timeout | undefined;

// Status bar: shows your role and the session code
const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

function updateStatus(code?: string) {
    if (!session.role) {
        status.hide();
        return;
    }
    status.text = `$(broadcast) Parallel: ${session.role}` + (code ? ` · ${code}` : '');
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

// PROMOTED GUEST: open an editable copy of the shared text and sync from it
async function becomeEditor() {
    const doc = await vscode.workspace.openTextDocument({
        content: sharedText,
        language: languageFor(sharedFile),
    });
    hostDoc = doc;
    hostFileName = sharedFile;
    await vscode.window.showTextDocument(doc, { preview: false });
}

// Forget everything about the shared file (session over)
function resetShared() {
    sharedUri = undefined;
    sharedText = '';
    hostDoc = undefined;
    lastPeers = [];
    joinedOk = false;
    warnedTooBig = false;
    session.name = '';
    clearCursors();
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

// ---------- activate ----------

export function activate(context: vscode.ExtensionContext) {
    registerSafetyStatus(context);

    // Message handlers. Teammates add their own with onMessage in their own files.
    onMessage('created', (msg) => {
        joinedOk = true;
        showCode(msg.code);
        sendDoc();
        updateStatus(msg.code);
    });
    onMessage('join_request', (msg) => handleJoinRequest(msg.name));
    onMessage('joined', () => {
        joinedOk = true;
        vscode.window.showInformationMessage("You're in! The host approved you.");
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
            (msg.list ?? []).map((n: string) => ({ name: n, role: 'guest' }));
        console.log('peers:', lastPeers);
        sendDoc(); // editors re-send so late joiners and demoted people see the file
    });
    onMessage('doc', (msg) => {
        if (session.role === 'guest') {
            showSharedDoc(msg.text, msg.file);
            setTimeout(repaintCursors, 100);
        } else {
            applyRemote(msg.text).then(repaintCursors); // another editor changed the file
        }
    });
    onMessage('cursor', (msg) => {
        cursors.set(msg.name, { line: msg.line, character: msg.character });
        repaintCursors();
    });
    onMessage('cursor_gone', (msg) => removeCursor(msg.name));
        onMessage('left', (msg) => {
        vscode.window.showInformationMessage(
            msg.pending
                ? `${msg.name} left before being approved.`
                : `${msg.name} left the session.`);
    });
    onMessage('role', (msg) => {
        session.role = msg.role;
        updateStatus();
        vscode.window.showInformationMessage(`You are now a ${msg.role}.`);
        if (msg.role === 'host') {
            becomeEditor();
        } else if (msg.role === 'guest') {
            hostDoc = undefined;   // stop syncing from our own file
            sharedUri = undefined; // the next doc reopens the read-only tab
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
        if (session.role !== undefined && !joinedOk) {
            // our create or join was refused (bad code, name taken, expired...): leave cleanly
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
        session.name = name.trim().slice(0, 30);
        send({ t: 'join', code: code.trim().toUpperCase(), name: session.name });
        vscode.window.showInformationMessage('Waiting for the host to approve you...');
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

    context.subscriptions.push(
        start, join, changeRole, provider, watcher,
        selectionWatcher, visibleWatcher, status);
}

export function deactivate() {
    disconnect();
}