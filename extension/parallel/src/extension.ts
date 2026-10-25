import * as vscode from 'vscode';
import { connect, send, onMessage, disconnect, session, isEditor } from './connection';

const SCHEME = 'parallel';

// Guest side: the text being shown, and the address of the read-only tab
let sharedText = '';
let sharedUri: vscode.Uri | undefined;
const sharedChanged = new vscode.EventEmitter<vscode.Uri>();

// Editor side: the file being shared, and a timer to avoid sending on every keystroke
let hostDoc: vscode.TextDocument | undefined;
let sendTimer: NodeJS.Timeout | undefined;

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

// EDITOR: send the current text of the shared file
function sendDoc() {
    if (!hostDoc) {
        return;
    }
    send({
        t: 'doc',
        text: hostDoc.getText(),
        file: hostDoc.fileName.split(/[\\/]/).pop(),
    });
}

// GUEST: show (or update) the read-only tab
async function showSharedDoc(text: string, file: string) {
    sharedText = text;
    if (!sharedUri) {
        sharedUri = vscode.Uri.from({ scheme: SCHEME, path: '/' + (file || 'shared.txt') });
        const doc = await vscode.workspace.openTextDocument(sharedUri);
        await vscode.window.showTextDocument(doc, { preview: false });
    } else {
        sharedChanged.fire(sharedUri);
    }
}

// Forget everything about the shared file (session over)
function resetShared() {
    sharedUri = undefined;
    sharedText = '';
    hostDoc = undefined;
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
        console.log('peers:', msg.peers ?? msg.list);
        sendDoc(); // editor re-sends so late joiners see the file
    });
    onMessage('doc', (msg) => {
        if (session.role === 'guest') {
            showSharedDoc(msg.text, msg.file);
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

    // Guest: the read-only "parallel:" files
    const provider = vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
        onDidChange: sharedChanged.event,
        provideTextDocumentContent: () => sharedText,
    });

    // Editors: send the file whenever it changes (wait 100 ms after the last keystroke)
    const watcher = vscode.workspace.onDidChangeTextDocument((e) => {
        if (!isEditor() || e.document !== hostDoc) {
            return;
        }
        clearTimeout(sendTimer);
        sendTimer = setTimeout(sendDoc, 100);
    });

    context.subscriptions.push(hello, start, join, provider, watcher, status);
}

export function deactivate() {
    disconnect();
}