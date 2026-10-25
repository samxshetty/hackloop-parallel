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

    context.subscriptions.push(hello, start, join, micTest);
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

export function deactivate() {}