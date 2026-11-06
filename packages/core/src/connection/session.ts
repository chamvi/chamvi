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
    dataKey: Uint8Array;
    connections: IConnectionRepository;
    locks: ILockRepository;
    clock: IClock;
};

/** The session `IConnectionVault.open` returns; holds the lease it was given. */
export class ConnectionSession implements IConnectionSession {
    readonly name: string;

    readonly lost: Promise<LeaseLostError>;

    protected opts: SessionOptions;

    protected state: 'open' | 'lost' | 'closed' = 'open';

    protected lostError?: LeaseLostError;

    protected resolveLost: (error: LeaseLostError) => void;

    /** Settles after every accepted write; never rejects. */
    protected tail: Promise<void> = Promise.resolve();

    /** The first write failure since the last flush. */
    protected failure?: { error: unknown };

    protected timer?: { clear(): void };

    protected closing?: Promise<void>;

    constructor(opts: SessionOptions) {
        this.opts = opts;
        this.name = opts.name;

        const { promise, resolve } = Promise.withResolvers<LeaseLostError>();

        this.lost = promise;
        this.resolveLost = resolve;
        this.schedule();
    }

    protected schedule(): void {
        this.timer = this.opts.clock.setTimeout(() => {
            void this.renew();
        }, Math.floor(this.opts.leaseTtlMs / 3));
    }

    protected get renewing(): boolean {
        return this.state === 'open' && !this.closing;
    }

    protected async renew(): Promise<void> {
        if (!this.renewing) {
            return;
        }

        let renewed: boolean;

        try {
            renewed = await this.opts.locks.renew(this.opts.lock, this.opts.owner, this.opts.leaseTtlMs);
        } catch {
            // a store hiccup is retried; an expired lease shows on the next renew, and writes are fenced anyway
            renewed = true;
        }

        if (!this.renewing) {
            return;
        }

        if (renewed) {
            this.schedule();
        } else {
            this.lose();
        }
    }

    protected lose(): void {
        if (this.state !== 'open') {
            return;
        }

        this.state = 'lost';
        this.timer?.clear();
        this.lostError = new LeaseLostError({ lock: this.opts.lock });
        this.resolveLost(this.lostError);
    }

    protected assertUsable(): void {
        if (this.closing) {
            throw new InvalidRunStateError(`The session of connection "${this.name}" is closed.`);
        }

        if (this.lostError) {
            throw this.lostError;
        }
    }

    async read(keys: readonly string[]): Promise<Map<string, Uint8Array>> {
        this.assertUsable();
        await this.tail;
        this.assertUsable();

        const sealed = await this.opts.connections.findEntries(this.name, keys);
        const found = new Map<string, Uint8Array>();

        for (const [key, value] of sealed) {
            found.set(key, open(this.opts.dataKey, value, entryAadOf(this.name, key)));
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

        const set: Record<string, Uint8Array> = {};

        for (const [key, value] of Object.entries(write.set ?? {})) {
            set[key] = seal(this.opts.dataKey, value, entryAadOf(this.name, key));
        }

        const sealed: ConnectionEntryWrite = {
            ...(write.clear && { clear: true }),
            ...(write.set && { set }),
            ...(write.delete && { delete: [...write.delete] }),
        };
        const fence = { lock: this.opts.lock, owner: this.opts.owner };
        const result = this.tail.then(() => {
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
            this.timer?.clear();
            await this.tail;
            this.state = 'closed';
            this.opts.dataKey.fill(0);

            try {
                await this.opts.locks.release(this.opts.lock, this.opts.owner);
            } catch {
                // the lease then expires on its own after its ttl
            }
        })();

        return this.closing;
    }
}
