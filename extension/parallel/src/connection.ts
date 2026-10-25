import * as vscode from 'vscode';
import { WebSocket } from 'ws';

type Handler = (msg: any) => void;
export type Role = 'superhost' | 'host' | 'guest';

// message type -> functions to call when that type arrives
const handlers = new Map<string, Handler[]>();
let socket: WebSocket | undefined;

// Shared state anyone can read
export const session = {
    role: undefined as Role | undefined,
};

// True for the roles that may edit directly
export function isEditor(): boolean {
    return session.role === 'superhost' || session.role === 'host';
}

// Register a function for one message type, e.g. onMessage('peers', fn)
export function onMessage(type: string, fn: Handler) {
    const list = handlers.get(type) ?? [];
    list.push(fn);
    handlers.set(type, list);
}

export function send(msg: object) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
    }
}

export function disconnect() {
    socket?.close();
}

export function connect(): Promise<void> {
    const url = vscode.workspace
        .getConfiguration('parallel')
        .get<string>('serverUrl', 'ws://localhost:8080');
    return new Promise((resolve, reject) => {
        socket?.close();
        const ws = new WebSocket(url);
        ws.on('open', () => { socket = ws; resolve(); });
        ws.on('error', (err) => reject(err));
        ws.on('message', (data) => {
            let msg: any;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                return; // ignore malformed messages
            }
            for (const fn of handlers.get(msg.t) ?? []) {
                fn(msg);
            }
        });
        ws.on('close', () => {
            socket = undefined;
            for (const fn of handlers.get('closed') ?? []) {
                fn({ t: 'closed' });
            }
        });
    });
}