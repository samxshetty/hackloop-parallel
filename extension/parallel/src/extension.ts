import * as vscode from 'vscode';
import { connect, send, onMessage, disconnect, session, isEditor } from './connection';

const SCHEME = 'parallel';

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

// Latest list of participants (name and role), from the server's "peers" message
let lastPeers: { name: string; role: string }[] = [];

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

// EDITOR: send the current text of the shared file
function sendDoc() {
    if (!hostDoc) {
        return;
    }
    send({ t: 'doc', text: hostDoc.getText(), file: hostFileName });
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

    // Message handlers. Teammates add their own with onMessage in their own files.
    onMessage('created', (msg) => {
        showCode(msg.code);
        sendDoc();
        updateStatus(msg.code);
    });
    onMessage('join_request', (msg) => handleJoinRequest(msg.name));
    onMessage('joined', () => {
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
        } else {
            applyRemote(msg.text); // another editor changed the file
        }
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
    onMessage('error', (msg) =>
        vscode.window.showWarningMessage('Server: ' + (msg.msg ?? msg.message)));
    onMessage('closed', () => {
        if (session.role !== undefined) {
            vscode.window.showWarningMessage('Disconnected from the server.');
        }
        session.role = undefined;
        updateStatus();
        resetShared();
    });

    const hello = vscode.commands.registerCommand('parallel.helloWorld', async () => {
        const name = await vscode.window.showInputBox({ prompt: 'Your name?' });
        if (!name) {
            return;
        }
        vscode.window.showInformationMessage(`Welcome ${name}, your code is ABC123`);
    });

    // SUPERHOST: start a session
    const start = vscode.commands.registerCommand('parallel.start', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Open the file you want to share first.');
            return;
        }
        const name = await vscode.window.showInputBox({ prompt: 'Your name (host)?' });
        if (!name) {
            return;
        }
        try {
            await connect();
        } catch {
            vscode.window.showErrorMessage('Cannot reach the server. Is it running?');
            return;
        }
        session.role = 'superhost';
        hostDoc = editor.document;
        hostFileName = baseName(editor.document.fileName);
        send({ t: 'create', name });
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
        if (!name) {
            return;
        }
        try {
            await connect();
        } catch {
            vscode.window.showErrorMessage('Cannot reach the server. Is it running?');
            return;
        }
        session.role = 'guest';
        send({ t: 'join', code: code.trim().toUpperCase(), name });
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

    context.subscriptions.push(hello, start, join, changeRole, provider, watcher, status);
}

export function deactivate() {
    disconnect();
}