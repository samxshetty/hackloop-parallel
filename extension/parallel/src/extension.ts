import * as vscode from 'vscode';
import { WebSocket } from 'ws';

const SERVER_URL = 'ws://localhost:8080';
const SCHEME = 'parallel';

let myRole: 'host' | 'guest' | undefined;
let socket: WebSocket | undefined;

// Guest side: the text being shown, and the address of the read-only tab
let sharedText = '';
let sharedUri: vscode.Uri | undefined;
const sharedChanged = new vscode.EventEmitter<vscode.Uri>();

// Host side: the file being shared, and a timer to avoid sending on every keystroke
let hostDoc: vscode.TextDocument | undefined;
let sendTimer: NodeJS.Timeout | undefined;

// ---------- connection ----------

// Connect and wait until the connection is actually open
function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        socket?.close();
        const ws = new WebSocket(SERVER_URL);
        ws.on('open', () => { socket = ws; resolve(ws); });
        ws.on('error', (err) => reject(err));
        ws.on('message', (data) => handleMessage(JSON.parse(data.toString())));
        ws.on('close', () => {
            if (myRole !== undefined) {
                vscode.window.showWarningMessage('Disconnected from the server.');
            }
            myRole = undefined;
            socket = undefined;
            resetShared();
        });
    });
}

// Send an object to the server as JSON text
function send(msg: object) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
    }
}

// ---------- sharing the document ----------

// HOST: send the current text of the shared file
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

// ---------- messages from the server ----------

function handleMessage(msg: any) {
    switch (msg.t) {
        case 'created':
            showCode(msg.code);
            sendDoc();
            break;
        case 'join_request':
            handleJoinRequest(msg.name);
            break;
        case 'joined':
            vscode.window.showInformationMessage("You're in! The host approved you.");
            break;
        case 'denied':
            vscode.window.showWarningMessage('The host denied your request.');
            myRole = undefined;
            resetShared();
            socket?.close();
            break;
        case 'peers':
            // Pratham's sidebar will use this later
            console.log('peers:', msg.list);
            // Host re-sends the document so late joiners see it
            sendDoc();
            break;
        case 'doc':
            showSharedDoc(msg.text, msg.file);
            break;
        case 'ended':
            vscode.window.showInformationMessage('The host ended the session.');
            myRole = undefined;
            resetShared();
            socket?.close();
            break;
        case 'error':
            vscode.window.showWarningMessage('Server: ' + msg.msg);
            break;
        default:
            console.log('Unhandled message', msg);
    }
}

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

// ---------- commands ----------

export function activate(context: vscode.ExtensionContext) {

    const hello = vscode.commands.registerCommand('parallel.helloWorld', async () => {
        const name = await vscode.window.showInputBox({ prompt: 'Your name?' });
        if (!name) {
            return;
        }
        vscode.window.showInformationMessage(`Welcome ${name}, your code is ABC123`);
    });

    // HOST: start a session
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
        myRole = 'host';
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
        myRole = 'guest';
        send({ t: 'join', code: code.trim().toUpperCase(), name });
        vscode.window.showInformationMessage('Waiting for the host to approve you...');
    });

    // Guest: the read-only "parallel:" files
    const provider = vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
        onDidChange: sharedChanged.event,
        provideTextDocumentContent: () => sharedText,
    });

    // Host: send the file whenever it changes (wait 100 ms after the last keystroke)
    const watcher = vscode.workspace.onDidChangeTextDocument((e) => {
        if (myRole !== 'host' || e.document !== hostDoc) {
            return;
        }
        clearTimeout(sendTimer);
        sendTimer = setTimeout(sendDoc, 100);
    });

    context.subscriptions.push(hello, start, join, provider, watcher);
}

export function deactivate() {
    socket?.close();
}