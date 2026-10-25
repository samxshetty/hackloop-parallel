import * as vscode from 'vscode';
import { WebSocket } from 'ws';

type Handler = (msg: any) => void;
export type Role = 'superhost' | 'host' | 'guest';

const CONNECT_TIMEOUT_MS = 10000;

// message type -> functions to call when that type arrives
const handlers = new Map<string, Handler[]>();
let socket: WebSocket | undefined;

// Shared state anyone can read
export const session = {
    role: undefined as Role | undefined,
    name: '', // your display name in this session (empty when no session is active)
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

// Call every handler for a type. One broken handler must not stop the others.
function dispatch(type: string, msg: any) {
    for (const fn of handlers.get(type) ?? []) {
        try {
            fn(msg);
        } catch (err) {
            console.error(`Parallel: handler for "${type}" failed`, err);
        }
    }
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
        // Forget the old connection first, so its late "close" event
        // cannot wipe out the new one.
        const old = socket;
        socket = undefined;
        old?.close();

        const ws = new WebSocket(url);

        // Give up if the server does not answer in time
        const timer = setTimeout(() => {
            reject(new Error('timed out after 10 seconds'));
            ws.terminate();
        }, CONNECT_TIMEOUT_MS);

        ws.on('open', () => {
            clearTimeout(timer);
            socket = ws;
            resolve();
        });
        ws.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        ws.on('message', (data) => {
            if (ws !== socket) {
                return; // from a connection we already replaced
            }
            let msg: any;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                return; // ignore malformed messages
            }
            if (msg && typeof msg.t === 'string') {
                dispatch(msg.t, msg);
            }
        });
        ws.on('close', () => {
            clearTimeout(timer);
            if (ws !== socket) {
                return; // an old or replaced connection
            }
            socket = undefined;
            dispatch('closed', { t: 'closed' });
        });
    });
}