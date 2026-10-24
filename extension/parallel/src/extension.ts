import * as vscode from 'vscode';

// Remember who we are in the session (used by later steps)
let myRole: 'host' | 'guest' | undefined;

// Makes a random 6-character code (fake for now; the server will make real ones)
function makeFakeCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

export function activate(context: vscode.ExtensionContext) {

    // Step 1 command: ask for a name, show a fake code
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
        const code = makeFakeCode();
        myRole = 'host';

        const pick = await vscode.window.showInformationMessage(
            `Session started, ${name}! Your code is ${code}`,
            'Copy code'
        );
        if (pick === 'Copy code') {
            await vscode.env.clipboard.writeText(code);
        }
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
        myRole = 'guest';
        vscode.window.showInformationMessage(
            `Hi ${name}! Waiting for the host to approve you (code ${code.toUpperCase()})...`
        );
    });

    context.subscriptions.push(hello, start, join);
}

export function deactivate() {}