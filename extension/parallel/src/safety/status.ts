import * as vscode from 'vscode';
import { onMessage } from '../connection';

let statusBarItem: vscode.StatusBarItem | undefined;

export function registerSafetyStatus(context: vscode.ExtensionContext): vscode.StatusBarItem {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.name = 'Parallel Safety';

    onMessage('masked', (msg: { count?: number; kinds?: string[] }) => {
        const count = typeof msg.count === 'number' ? msg.count : 0;
        const kinds = Array.isArray(msg.kinds) ? msg.kinds : [];
        updateSafetyStatus(count, kinds);
    });

    onMessage('ended', () => {
        hideSafetyStatus();
    });

    onMessage('closed', () => {
        hideSafetyStatus();
    });

    context.subscriptions.push(statusBarItem);
    return statusBarItem;
}

export function updateSafetyStatus(count: number, kinds: string[]) {
    if (!statusBarItem) {
        return;
    }
    if (count <= 0) {
        statusBarItem.hide();
        return;
    }
    statusBarItem.text = `$(shield) ${count} hidden`;
    const kindList = kinds.length > 0 ? kinds.join(', ') : 'Secrets';
    statusBarItem.tooltip = `Hidden secrets: ${kindList}`;
    statusBarItem.show();
}

export function hideSafetyStatus() {
    if (statusBarItem) {
        statusBarItem.hide();
    }
}
