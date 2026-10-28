import { onMessage } from '../connection';
import { logSafety } from './log';

export interface ContributorCredit {
    name: string;
    edits: number;
    lines: number;
    revoked: boolean;
    count: number; // alias for edits
}

export interface CreditRecord {
    guestName: string;
    timestamp: number;
    file: string;
    lineRange: [number, number];
}

class CreditLedger {
    private contributors: Map<string, ContributorCredit> = new Map();
    private records: CreditRecord[] = [];

    constructor() {
        onMessage('ended', () => this.clear());
        onMessage('closed', () => this.clear());

        // Update ledger from authoritative server credit messages
        onMessage('credit', (msg: any) => {
            if (msg && Array.isArray(msg.list)) {
                this.updateFromCreditList(msg.list);
            }
        });
    }

    public updateFromCreditList(list: Array<{ name: string; edits: number; lines: number; revoked?: boolean }>) {
        this.contributors.clear();
        for (const item of list) {
            if (!item || !item.name) {
                continue;
            }
            const edits = typeof item.edits === 'number' ? item.edits : 0;
            const lines = typeof item.lines === 'number' ? item.lines : 0;
            const revoked = !!item.revoked;
            this.contributors.set(item.name, {
                name: item.name,
                edits,
                lines,
                revoked,
                count: edits,
            });
        }
    }

    public getCreditedGuests(): ContributorCredit[] {
        return Array.from(this.contributors.values());
    }

    public getContributorCount(): number {
        return this.contributors.size;
    }

    public getCounts(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const [name, c] of this.contributors.entries()) {
            counts.set(name, c.edits);
        }
        return counts;
    }

    public getCount(guestName: string): number {
        return this.contributors.get(guestName)?.edits || 0;
    }

    public getRecords(): ReadonlyArray<CreditRecord> {
        return this.records;
    }

    public record(record: { guestName: string; timestamp?: number; file?: string; lineRange?: [number, number] }) {
        const guestName = (record.guestName || '').trim();
        if (!guestName) {
            return;
        }

        const entry: CreditRecord = {
            guestName,
            timestamp: record.timestamp ?? Date.now(),
            file: record.file || '',
            lineRange: record.lineRange || [0, 0],
        };
        this.records.push(entry);

        const existing = this.contributors.get(guestName);
        if (existing) {
            existing.edits += 1;
            existing.count += 1;
        } else {
            this.contributors.set(guestName, {
                name: guestName,
                edits: 1,
                lines: 1,
                revoked: false,
                count: 1,
            });
        }
    }

    public clear() {
        this.contributors.clear();
        this.records = [];
    }
}

export const ledger = new CreditLedger();

export function recordCredit(guestName: string, file?: string, lineRange?: [number, number]) {
    ledger.record({
        guestName,
        timestamp: Date.now(),
        file: file || '',
        lineRange: lineRange || [0, 0],
    });
}
