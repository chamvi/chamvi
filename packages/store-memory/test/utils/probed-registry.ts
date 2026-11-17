/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { EntityRecord } from '@chamvi/store';
import { MemoryRegistry } from '@chamvi/store-memory';
import type { MemoryTransaction } from '@chamvi/store-memory';

export type Write = {
    entity: string;
    key: string;
    row: EntityRecord | null
};

/**
 * The registry under test, watched from outside its own bookkeeping: i
 * keeps every transaction, every write in the order it was kept, the order
 * of the commits, and checks each lock request against a wait-for graph i
 * builds itself from the lines. A finding is recorded, never thrown (a
 * script may swallow what a call throws).
 */
export class ProbedRegistry extends MemoryRegistry {
    transactions: MemoryTransaction[] = [];

    writes = new Map<number, Write[]>();

    commits: number[] = [];

    refusals = 0;

    findings: string[] = [];

    override begin(): MemoryTransaction {
        const transaction = super.begin();

        this.transactions.push(transaction);

        return transaction;
    }

    override write(entity: string, key: string, row: EntityRecord | null, transaction: MemoryTransaction): void {
        const closed = Boolean(transaction.aborted ?? transaction.ended);

        super.write(entity, key, row, transaction);

        if (closed) {
            this.findings.push(`transaction ${transaction.id} wrote after it was aborted or ended`);
        }

        const writes = this.writes.get(transaction.id) ?? [];

        writes.push({
            entity,
            key,
            row: row && structuredClone(row),
        });
        this.writes.set(transaction.id, writes);
    }

    override commit(transaction: MemoryTransaction): void {
        try {
            super.commit(transaction);
            this.commits.push(transaction.id);
        } finally {
            this.inspect(`commit of ${transaction.id}`);
        }
    }

    override rollback(transaction: MemoryTransaction, reason?: unknown): void {
        super.rollback(transaction, reason);
        this.inspect(`rollback of ${transaction.id}`);
    }

    /**
     * Nothing is locked and every transaction ended with nothing held.
     */
    isIdle(): boolean {
        return this.locks.size === 0 &&
            this.transactions.every((transaction) => transaction.ended && transaction.held.size === 0);
    }

    // not async: the checks run in the step of the request itself
    protected override lock(entity: string, name: string, transaction: MemoryTransaction): Promise<void> {
        const closed = Boolean(transaction.aborted ?? transaction.ended);
        const held = transaction.held.size;
        const cycle = !closed && this.closesCycle(name, transaction);
        const promise = super.lock(entity, name, transaction);

        if (closed) {
            if (transaction.held.size !== held || this.standsInLine(transaction)) {
                this.findings.push(`transaction ${transaction.id} took or queued for a lock after it was aborted or ended`);
            }
        } else {
            const refused = transaction.aborted !== undefined;

            if (refused) {
                this.refusals += 1;
            }

            if (refused && !cycle) {
                this.findings.push(`transaction ${transaction.id} was refused without a cycle`);
            }

            if (!refused && cycle) {
                this.findings.push(`transaction ${transaction.id} was queued into a cycle`);
            }
        }

        this.inspect(`request of ${transaction.id}`);

        return promise;
    }

    /**
     * Whether the transaction stands in the line of the lock, or of any.
     */
    protected standsInLine(transaction: MemoryTransaction, name?: string): boolean {
        return this.locks.entries().some(([key, lock]) => (name === undefined || key === name) &&
            lock.queue.some((waiter) => waiter.transaction === transaction));
    }

    /**
     * The wait-for graph of the open transactions: a waiter waits for the
     * owner and for everyone ahead of it. An aborted or ended transaction
     * waits for nothing (its rollback needs no lock).
     */
    protected graph(): Map<MemoryTransaction, Set<MemoryTransaction>> {
        const edges = new Map<MemoryTransaction, Set<MemoryTransaction>>();

        for (const lock of this.locks.values()) {
            const ahead = [lock.owner];

            for (const waiter of lock.queue) {
                if (!waiter.transaction.aborted && !waiter.transaction.ended) {
                    const targets = edges.get(waiter.transaction) ?? new Set();

                    for (const target of ahead) {
                        targets.add(target);
                    }

                    edges.set(waiter.transaction, targets);
                }

                ahead.push(waiter.transaction);
            }
        }

        return edges;
    }

    /**
     * Whether a new wait of the transaction for the lock closes a cycle.
     */
    protected closesCycle(name: string, transaction: MemoryTransaction): boolean {
        const lock = this.locks.get(name);

        if (!lock || lock.owner === transaction || this.standsInLine(transaction, name)) {
            return false;
        }

        const edges = this.graph();
        const reached = new Set<MemoryTransaction>([lock.owner, ...lock.queue.map((waiter) => waiter.transaction)]);

        // the closure of what the new wait would wait for
        for (const current of reached) {
            for (const target of edges.get(current) ?? []) {
                reached.add(target);
            }
        }

        return reached.has(transaction);
    }

    /**
     * The rules of the locks, checked from the outside.
     */
    protected inspect(at: string): void {
        for (const [name, lock] of this.locks) {
            if (lock.owner.ended || !lock.owner.held.has(name)) {
                this.findings.push(`${at}: a lock is owned by an ended transaction or one that does not hold it`);
            }

            const waiting = lock.queue.map((waiter) => waiter.transaction);

            if (new Set(waiting).size !== waiting.length || waiting.includes(lock.owner)) {
                this.findings.push(`${at}: a transaction stands twice in a line or in the line of its own lock`);
            }

            const closed = waiting.filter((transaction) => transaction.aborted ?? transaction.ended);

            if (closed.length > 0) {
                this.findings.push(`${at}: an aborted or ended transaction stands in a line`);
            }
        }

        for (const transaction of this.transactions) {
            if (transaction.ended && transaction.held.size > 0) {
                this.findings.push(`${at}: the ended transaction ${transaction.id} holds a lock`);
            }

            for (const name of transaction.held) {
                if (this.locks.get(name)?.owner !== transaction) {
                    this.findings.push(`${at}: transaction ${transaction.id} names a lock it does not own`);
                }
            }
        }

        // a cycle: some transaction reaches itself
        const edges = this.graph();

        for (const start of edges.keys()) {
            const reached = new Set(edges.get(start));

            for (const current of reached) {
                for (const target of edges.get(current) ?? []) {
                    reached.add(target);
                }
            }

            if (reached.has(start)) {
                this.findings.push(`${at}: transaction ${start.id} waits for itself`);
            }
        }
    }
}
