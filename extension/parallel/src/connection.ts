import * as vscode from 'vscode';
import { WebSocket } from 'ws';

type Handler = (msg: any) => void;
export type Role = 'superhost' | 'host' | 'guest';

const CONNECT_TIMEOUT_MS = 10000;

const handlers = new Map<string, Handler[]>();
let socket: WebSocket | undefined;

export const session = {
    role: undefined as Role | undefined,
    name: '', 
    canEdit: false,
};

export function isEditor(): boolean {
    return session.role === 'superhost' || session.role === 'host' || session.canEdit;
}

export function onMessage(type: string, fn: Handler) {
    const list = handlers.get(type) ?? [];
    list.push(fn);
    handlers.set(type, list);
}

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
        const old = socket;
        socket = undefined;
        old?.close();

        const ws = new WebSocket(url);

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
                return; 
            }
            let msg: any;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                return; 
            }
            if (msg && typeof msg.t === 'string') {
                dispatch(msg.t, msg);
            }
        });
        ws.on('close', () => {
            clearTimeout(timer);
            if (ws !== socket) {
                return;
            }
            socket = undefined;
            dispatch('closed', { t: 'closed' });
        });
    });
}
