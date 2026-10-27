import * as vscode from 'vscode';
import { onMessage } from '../connection';

let safetyChannel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
    if (!safetyChannel) {
        safetyChannel = vscode.window.createOutputChannel('Parallel Safety');
    }
    return safetyChannel;
}

export function logSafety(message: string) {
    const timestamp = new Date().toISOString();
    getChannel().appendLine(`[${timestamp}] ${message}`);
}

export function registerSafetyLogger(context: vscode.ExtensionContext) {
    const channel = getChannel();

    // Listen to secrets masked
    onMessage('masked', (msg: { count?: number; kinds?: string[] }) => {
        const count = typeof msg.count === 'number' ? msg.count : 0;
        if (count > 0) {
            const kinds = Array.isArray(msg.kinds) && msg.kinds.length > 0 ? msg.kinds.join(', ') : 'Unknown';
            logSafety(`Masked ${count} secret(s): ${kinds}`);
        }
    });

    // Register command to view output channel
    const showCmd = vscode.commands.registerCommand('parallel.showSafetyLog', () => {
        channel.show(true);
    });

    context.subscriptions.push(channel, showCmd);
}
