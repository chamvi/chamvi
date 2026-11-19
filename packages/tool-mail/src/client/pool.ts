/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ClockTimer, IClock } from '@chamvi/core';
import { ChamviError } from '@chamvi/core';
import type { ImapFlow, ListResponse } from 'imapflow';
import type { MailAccountNormalized } from '../options/types.ts';
import { requestError } from './asserts.ts';
import { createImapConnection } from './login.ts';
import { createQueue } from './queue.ts';

const TIMED_OUT = Symbol('timed out');

/** One lazy imapflow connection per account, calls serialised per account, and each account's listed folders. */
export class MailConnectionPool {
    private readonly clock: IClock;

    private readonly timeoutMs: number;

    private readonly connections = new Map<string, ImapFlow>();

    private readonly listed = new Map<string, ListResponse[]>();

    private readonly enqueue = createQueue();

    constructor(options: { clock: IClock; timeoutMs: number }) {
        this.clock = options.clock;
        this.timeoutMs = options.timeoutMs;
    }

    async close(): Promise<void> {
        const connections = this.connections.values().toArray();

        this.connections.clear();

        await Promise.all(connections.map(async (connection) => {
            let timer: ClockTimer | undefined;

            try {
                await Promise.race([
                    connection.logout(),
                    new Promise<void>((resolve) => {
                        timer = this.clock.setTimeout(resolve, this.timeoutMs);
                        timer.unref?.();
                    }),
                ]);
            } catch {
                // the connection is gone anyway
            } finally {
                timer?.clear();
                connection.close();
            }
        }));
    }

    /**
     * Runs `operation` on the account's connection in the account's queue, racing the timeout on the clock and
     * the signal. A timeout or an abort drops the connection (the next call reconnects); any failure that is not
     * a ChamviError becomes `request failed`, never the server's text.
     */
    async run<T>(
        tool: string,
        account: MailAccountNormalized,
        signal: AbortSignal | undefined,
        operation: (connection: ImapFlow) => Promise<T>,
    ): Promise<T> {
        signal?.throwIfAborted();

        let timer: ClockTimer | undefined;
        let stopped = false;
        let used: ImapFlow | undefined;
        let onAbort: (() => void) | undefined;
        const interrupted = new Promise<never>((_, reject) => {
            timer = this.clock.setTimeout(() => reject(TIMED_OUT), this.timeoutMs);
            timer.unref?.();
            onAbort = () => reject(signal?.reason);
            signal?.addEventListener('abort', onAbort, { once: true });
        });

        interrupted.catch(() => undefined);

        const task = async () => {
            if (stopped) {
                throw TIMED_OUT;
            }

            used = await this.connection(tool, account);

            return operation(used);
        };

        try {
            return await Promise.race([this.enqueue(account.id, () => Promise.race([task(), interrupted])), interrupted]);
        } catch (error) {
            if (error === TIMED_OUT || signal?.aborted) {
                stopped = true;

                if (used) {
                    this.drop(account.id, used);
                }

                if (error === TIMED_OUT) {
                    throw requestError(tool, account.id, 'timed out');
                }

                throw error;
            }

            if (error instanceof ChamviError) {
                throw error;
            }

            throw requestError(tool, account.id, 'request failed');
        } finally {
            timer?.clear();

            if (onAbort) {
                signal?.removeEventListener('abort', onAbort);
            }
        }
    }

    /** The account's folders with their special use, listed once per client (LIST and LSUB, no STATUS). */
    async folders(connection: ImapFlow, account: MailAccountNormalized): Promise<ListResponse[]> {
        let listed = this.listed.get(account.id);

        if (!listed) {
            listed = await connection.list();
            this.listed.set(account.id, listed);
        }

        return listed;
    }

    private async connection(tool: string, account: MailAccountNormalized): Promise<ImapFlow> {
        const current = this.connections.get(account.id);

        if (current?.usable) {
            return current;
        }

        if (current) {
            this.drop(account.id, current);
        }

        const connection = createImapConnection(account);

        connection.on('error', () => this.drop(account.id, connection));
        connection.on('close', () => this.drop(account.id, connection));
        this.connections.set(account.id, connection);

        try {
            await connection.connect();
        } catch (error) {
            this.drop(account.id, connection);

            const failed = (error as { authenticationFailed?: boolean }).authenticationFailed;

            throw requestError(tool, account.id, failed ? 'login failed' : 'cannot connect');
        }

        return connection;
    }

    private drop(id: string, connection: ImapFlow): void {
        if (this.connections.get(id) === connection) {
            this.connections.delete(id);
        }

        try {
            connection.close();
        } catch {
            // already closed
        }
    }
}
