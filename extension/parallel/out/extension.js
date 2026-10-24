"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
// Remember who we are in the session (used by later steps)
let myRole;
// Makes a random 6-character code (fake for now; the server will make real ones)
function makeFakeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}
function activate(context) {
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
        const pick = await vscode.window.showInformationMessage(`Session started, ${name}! Your code is ${code}`, 'Copy code');
        if (pick === 'Copy code') {
            await vscode.env.clipboard.writeText(code);
        }
    });
    // GUEST: join a session
    const join = vscode.commands.registerCommand('parallel.join', async () => {
        const code = await vscode.window.showInputBox({
            prompt: 'Session code',
            validateInput: (value) => value.trim().length === 6 ? null : 'The code has 6 characters',
        });
        if (!code) {
            return;
        }
        const name = await vscode.window.showInputBox({ prompt: 'Your name?' });
        if (!name) {
            return;
        }
        myRole = 'guest';
        vscode.window.showInformationMessage(`Hi ${name}! Waiting for the host to approve you (code ${code.toUpperCase()})...`);
    });
    context.subscriptions.push(hello, start, join);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map