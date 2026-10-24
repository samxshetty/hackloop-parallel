import * as vscode from 'vscode';
import { WebSocket } from 'ws';

const SERVER_URL = 'ws://localhost:8080';

let myRole: 'host' | 'guest' | undefined;
let socket: WebSocket | undefined;

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
        });
    });
}

// Send an object to the server as JSON text
function send(msg: object) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
    }
}

// ---------- messages from the server ----------

function handleMessage(msg: any) {
    switch (msg.t) {
        case 'created':
            showCode(msg.code);
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
            socket?.close();
            break;
        case 'peers':
            // Pratham's sidebar will use this later
            console.log('peers:', msg.list);
            break;
        case 'ended':
            vscode.window.showInformationMessage('The host ended the session.');
            myRole = undefined;
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

    context.subscriptions.push(hello, start, join);
}

export function deactivate() {
    socket?.close();
}