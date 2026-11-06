/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '../clock/types.ts';
import { InvalidRunStateError, LeaseLostError } from '../errors/index.ts';
import { open, seal } from '../keyring/module.ts';
import type { IConnectionRepository, ILockRepository } from '../repository/types.ts';
import { entryAadOf } from './helpers.ts';
import type { ConnectionEntryWrite, IConnectionSession } from './types.ts';
import { assertConnectionEntryWrite } from './validate.ts';

type SessionOptions = {
    name: string;
    owner: string;
    lock: string;
    leaseTtlMs: number;
    /** The last confirmed lease expiry (ms since epoch on `clock`), a lower bound of the store's. */
    expiresAt: number;
    connections: IConnectionRepository;
    locks: ILockRepository;
    clock: IClock;
};

/** The session `IConnectionVault.open` returns; holds the lease it was given. */
export class ConnectionSession implements IConnectionSession {
    readonly name: string;

    readonly lost: Promise<LeaseLostError>;

    protected opts: SessionOptions;

    /** A private field: never enumerated, serialized or reachable from the session's properties. */
    #dataKey: Uint8Array;

    /** The last confirmed lease expiry; the session is lost once the clock reaches it. */
    protected expiresAt: number;

    protected deadline?: { clear(): void };

    protected state: 'open' | 'lost' | 'closed' = 'open';

    protected lostError?: LeaseLostError;

    protected resolveLost: (error: LeaseLostError) => void;

    /** Settles after every accepted write; never rejects. */
    protected tail: Promise<void> = Promise.resolve();

    /** The first write failure since the last flush. */
    protected failure?: { error: unknown };

    protected timer?: { clear(): void };

    protected closing?: Promise<void>;

    constructor(opts: SessionOptions, dataKey: Uint8Array) {
        this.opts = opts;
        this.name = opts.name;
        this.#dataKey = dataKey;
        this.expiresAt = opts.expiresAt;

        const { promise, resolve } = Promise.withResolvers<LeaseLostError>();

        this.lost = promise;
        this.resolveLost = resolve;
        this.schedule();
        this.watch();
    }

    protected schedule(): void {
        this.timer = this.opts.clock.setTimeout(() => {
            void this.renew();
        }, Math.floor(this.opts.leaseTtlMs / 3));
    }

    /** Loses the session when no renewal is confirmed before the last confirmed expiry. */
    protected watch(): void {
        this.deadline?.clear();
        this.deadline = this.opts.clock.setTimeout(() => {
            this.lose();
        }, Math.max(0, this.expiresAt - this.opts.clock.now().getTime()));
    }

    /** Renewal runs while open, also while close drains the accepted writes. */
    protected get renewing(): boolean {
        return this.state === 'open';
    }

    protected async renew(): Promise<void> {
        if (!this.renewing) {
            return;
        }

        // the store extends from its own reading, taken after this one: started + ttl is a lower bound
        const started = this.opts.clock.now().getTime();
        let renewed: boolean | undefined;

        try {
            renewed = await this.opts.locks.renew(this.opts.lock, this.opts.owner, this.opts.leaseTtlMs);
        } catch {
            // a store hiccup is retried until the last confirmed expiry, where the deadline loses the session
            renewed = undefined;
        }

        if (!this.renewing) {
            return;
        }

        if (renewed === false) {
            this.lose();

            return;
        }

        if (renewed) {
            this.expiresAt = Math.max(this.expiresAt, started + this.opts.leaseTtlMs);
            this.watch();
        }

        this.schedule();
    }

    /** Loses the session when the clock passed the last confirmed expiry (a timer may not have fired yet). */
    protected checkExpiry(): void {
        if (this.state === 'open' && this.opts.clock.now().getTime() >= this.expiresAt) {
            this.lose();
        }
    }

    protected lose(): void {
        if (this.state !== 'open') {
            return;
        }

        this.state = 'lost';
        this.timer?.clear();
        this.deadline?.clear();
        this.lostError = new LeaseLostError({ lock: this.opts.lock });
        this.resolveLost(this.lostError);
    }

    protected assertUsable(): void {
        if (this.closing) {
            throw new InvalidRunStateError(`The session of connection "${this.name}" is closed.`);
        }

        this.checkExpiry();

        if (this.lostError) {
            throw this.lostError;
        }
    }

    async read(keys: readonly string[]): Promise<Map<string, Uint8Array>> {
        this.assertUsable();
        await this.tail;
        this.assertUsable();

        const sealed = await this.opts.connections.findEntries(this.name, keys);

        // a close begun or a lease lost meanwhile: the data key may be zeroed already
        this.assertUsable();

        const found = new Map<string, Uint8Array>();

        for (const [key, value] of sealed) {
            found.set(key, open(this.#dataKey, value, entryAadOf(this.name, key)));
        }

        return found;
    }

    async readOne(key: string): Promise<Uint8Array | undefined> {
        const found = await this.read([key]);

        return found.get(key);
    }

    async write(write: ConnectionEntryWrite): Promise<void> {
        this.assertUsable();
        assertConnectionEntryWrite(write);

        // fromEntries defines own properties: an assignment of `__proto__` would set the prototype instead
        const set: Record<string, Uint8Array> = Object.fromEntries(
            Object.entries(write.set ?? {}).map(([key, value]) => [key, seal(this.#dataKey, value, entryAadOf(this.name, key))]),
        );

        const sealed: ConnectionEntryWrite = {
            ...(write.clear && { clear: true }),
            ...(write.set && { set }),
            ...(write.delete && { delete: [...write.delete] }),
        };
        const fence = { lock: this.opts.lock, owner: this.opts.owner };
        const result = this.tail.then(() => {
            this.checkExpiry();

            if (this.lostError) {
                throw this.lostError;
            }

            return this.opts.connections.writeEntries(this.name, sealed, fence);
        });

        this.tail = result.then(
            () => undefined,
            (error: unknown) => {
                if (error instanceof LeaseLostError) {
                    this.lose();
                }

                this.failure ??= { error };
            },
        );

        return result;
    }

    async flush(): Promise<void> {
        if (this.closing) {
            throw new InvalidRunStateError(`The session of connection "${this.name}" is closed.`);
        }

        await this.tail;

        if (this.lostError) {
            throw this.lostError;
        }

        const { failure } = this;

        if (!failure) {
            return;
        }

        this.failure = undefined;

        throw failure.error;
    }

    close(): Promise<void> {
        this.closing ??= (async () => {
            // renewal goes on until the accepted writes settled
            await this.tail;
            this.state = 'closed';
            this.timer?.clear();
            this.deadline?.clear();
            this.#dataKey.fill(0);

            try {
                await this.opts.locks.release(this.opts.lock, this.opts.owner);
            } catch {
                // the lease then expires on its own after its ttl
            }
        })();

        return this.closing;
    }
}
