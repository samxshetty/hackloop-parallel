import { onMessage } from '../connection';

export interface CreditRecord {
    guestName: string;
    timestamp: number;
    file: string;
    lineRange: [number, number];
}

class CreditLedger {
    private records: CreditRecord[] = [];
    private counts: Map<string, number> = new Map();

    constructor() {
        // Automatically clear when session ends or disconnects
        onMessage('ended', () => this.clear());
        onMessage('closed', () => this.clear());

        // Also hook into suggest_result if forwarded
        onMessage('suggest_result', (msg: any) => {
            if (msg && (msg.action === 'accept' || msg.accepted === true || msg.approve === true)) {
                const name = msg.guestName || msg.from || msg.name;
                if (name) {
                    this.record({
                        guestName: name,
                        timestamp: Date.now(),
                        file: msg.file || '',
                        lineRange: Array.isArray(msg.lineRange) ? msg.lineRange : [msg.line ?? 0, msg.line ?? 0],
                    });
                }
            }
        });
    }

    /**
     * Record an accepted suggestion.
     */
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
        const current = this.counts.get(guestName) || 0;
        this.counts.set(guestName, current + 1);
    }

    public getCounts(): Map<string, number> {
        return new Map(this.counts);
    }

    public getCount(guestName: string): number {
        return this.counts.get(guestName) || 0;
    }

    public getRecords(): ReadonlyArray<CreditRecord> {
        return this.records;
    }

    public getCreditedGuests(): Array<{ name: string; count: number }> {
        return Array.from(this.counts.entries())
            .filter(([_, count]) => count > 0)
            .map(([name, count]) => ({ name, count }));
    }

    public clear() {
        this.records = [];
        this.counts.clear();
    }
}

export const ledger = new CreditLedger();

/**
 * Record a credit for an accepted suggestion with one call.
 */
export function recordCredit(guestName: string, file?: string, lineRange?: [number, number]) {
    ledger.record({
        guestName,
        timestamp: Date.now(),
        file: file || '',
        lineRange: lineRange || [0, 0],
    });
}
