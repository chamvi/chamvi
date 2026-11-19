/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import { InvalidRunStateError } from '@chamvi/core';
import {
    WHATSAPP_AUTH_ERROR_CODE,
    WHATSAPP_CONNECTION_ERROR_CODE,
    WHATSAPP_RECONNECT,
} from './constants.ts';
import { guardConsole } from './console.ts';
import { WhatsAppGenerations } from './generations.ts';
import {
    admit,
    backoff,
    clearRetry,
    failure,
    heldElsewhere,
    isHeld,
    noop,
    resetUnsupported,
    untilAborted,
} from './helpers/index.ts';
import type {
    WhatsAppAuthLease,
    WhatsAppConnectionRun,
    WhatsAppGeneration,
    WhatsAppSocket,
} from './types.ts';

/**
 * One WhatsApp connection over `WhatsAppGenerations`: acquires the lease
 * of each generation (with its retries), connects, resets and closes.
 */
export class WhatsAppSession extends WhatsAppGenerations {
    /** A refused or failed acquire (or a session clear that failed under the lease): the status, then a retry. */
    protected onAcquireFailed(run: WhatsAppConnectionRun, error: unknown, message: string) {
        if (!this.isRunCurrent(run)) {
            return;
        }

        if (isHeld(error)) {
            // a reset's clear never waits for the lease: it would wipe the holder's session later
            run.clearPending = false;
            this.setRunStatus(run, 'held-elsewhere');

            if (!run.heldReported) {
                run.heldReported = true;
                this.report(failure(WHATSAPP_AUTH_ERROR_CODE, 'The WhatsApp session is held by another process; retrying until its lease is free.'));
            }

            this.scheduleAcquire(run);

            return;
        }

        run.failedAcquires += 1;
        this.setRunStatus(run, 'failed');
        this.report(failure(WHATSAPP_AUTH_ERROR_CODE, message, error));

        if (run.failedAcquires > WHATSAPP_RECONNECT.maxAttempts) {
            this.report(failure(
                WHATSAPP_CONNECTION_ERROR_CODE,
                `Acquiring the WhatsApp session failed ${run.failedAcquires} times in a row; reset or restart the channel to try again.`,
            ));

            return;
        }

        this.scheduleAcquire(run);
    }

    protected onLost(generation: WhatsAppGeneration) {
        if (!this.isCurrent(generation)) {
            return;
        }

        const { run } = generation;

        generation.leaseLost = true;
        this.report(failure(WHATSAPP_AUTH_ERROR_CODE, 'The WhatsApp session lease was lost; the socket ends and the connection waits for the session again.'));
        this.setStatus(generation, 'held-elsewhere');

        void this.closeGeneration(generation).then(() => {
            // a reset that began meanwhile acquires on its own, or schedules this retry when it ends
            if (this.isRunCurrent(run) && run.generation === generation && !run.resetting && !run.retry) {
                this.scheduleAcquire(run);
            }
        });
    }

    /**
     * One acquire: the generation holding its lease, or undefined when the
     * acquire failed (status and retry are set). Rejects once the generation
     * aborted (a close, a stop or a reset).
     */
    protected async acquireGeneration(run: WhatsAppConnectionRun): Promise<WhatsAppGeneration | undefined> {
        const controller = new AbortController();
        const generation: WhatsAppGeneration = {
            run,
            controller,
            signal: AbortSignal.any([run.signal, controller.signal]),
            admitting: true,
            closed: false,
            writes: new Set(),
            leaseLost: false,
            reset: run.clearPending,
            failures: 0,
        };

        run.generation = generation;

        const acquired = (async () => {
            const lease = await this.options.auth.acquire(generation.signal, { reset: generation.reset });

            // a lease that arrives after the stop is given back at once, never used
            if (generation.closed || generation.signal.aborted) {
                await this.release(lease);

                return undefined;
            }

            generation.lease = lease;

            return lease;
        })();

        generation.acquiring = acquired.then(noop, noop);

        let lease: WhatsAppAuthLease | undefined;

        try {
            lease = await untilAborted(acquired, generation.signal);
        } catch (error) {
            if (generation.signal.aborted) {
                throw generation.signal.reason;
            }

            generation.closed = true;
            generation.admitting = false;
            this.onAcquireFailed(run, error, 'Acquiring the WhatsApp session failed; the connection retries.');

            return undefined;
        }

        // an abort or close between the lease's arrival and here builds no socket (the close releases the lease)
        if (!lease || generation.signal.aborted || generation.closed) {
            throw generation.signal.aborted ? generation.signal.reason : new InvalidRunStateError('The WhatsApp connection closed while it connected.');
        }

        // a reset whose fresh creds are not saved yet keeps its budget: only a usable session starts the count over
        if (!run.clearPending) {
            run.retries = 0;
            run.failedAcquires = 0;
        }

        run.heldReported = false;
        lease.lost?.then(() => this.onLost(generation), noop);

        return generation;
    }

    /** Under the reset's lease, before the socket: the emptied session's fresh creds are saved. */
    protected async saveFreshCreds(generation: WhatsAppGeneration) {
        const lease = generation.lease!;

        await admit(generation, () => lease.saveCreds());
        generation.run.clearPending = false;
        generation.run.retries = 0;
        generation.run.failedAcquires = 0;
    }

    /**
     * Acquires, clears when a reset asked for it, then builds the socket. The
     * first establish of a connect rethrows an abort or a socket failure (the
     * start fails); later ones report and retry.
     */
    protected async establish(run: WhatsAppConnectionRun, first: boolean): Promise<void> {
        // a live generation (acquiring or holding its lease) stays the only one
        if (run.generation && !run.generation.closed) {
            return;
        }

        let generation: WhatsAppGeneration | undefined;

        try {
            generation = await this.acquireGeneration(run);
        } catch (error) {
            if (first) {
                throw error;
            }

            // aborted: the close or reset that aborted it carries on
            return;
        }

        if (!generation) {
            return;
        }

        if (!first) {
            this.setStatus(generation, 'connecting');
        }

        if (generation.reset) {
            try {
                await this.saveFreshCreds(generation);
            } catch (error) {
                if (generation.closed) {
                    return;
                }

                await this.closeGeneration(generation);
                this.onAcquireFailed(run, error, 'Saving the reset WhatsApp session failed; the connection retries.');

                return;
            }
        }

        // an abort or close since the lease arrived builds no socket (the close releases the lease)
        if (generation.closed || generation.signal.aborted) {
            if (first) {
                throw generation.signal.aborted ? generation.signal.reason : new InvalidRunStateError('The WhatsApp connection closed while it connected.');
            }

            return;
        }

        try {
            this.createSocket(generation);
        } catch (error) {
            if (first) {
                throw error;
            }

            this.report(failure(WHATSAPP_CONNECTION_ERROR_CODE, 'Creating the WhatsApp socket failed.', error));
            this.setStatus(generation, 'disconnected');
            this.scheduleReconnect(generation);
        }
    }

    protected scheduleAcquire(run: WhatsAppConnectionRun) {
        const delay = backoff(run.retries);

        run.retries += 1;
        run.retry = run.clock.setTimeout(() => {
            delete run.retry;

            if (this.isRunCurrent(run)) {
                void this.establish(run, false);
            }
        }, delay);
        run.retry.unref?.();
    }

    async connect({ signal, clock }: { signal: AbortSignal; clock: IClock }): Promise<void> {
        if (this.current && !this.current.closed) {
            throw new InvalidRunStateError('The WhatsApp connection is already connected.');
        }

        // a close still settling (flush, release) finishes before the next lease is taken
        await this.current?.closing;
        // an aborted connect never becomes the current run
        signal.throwIfAborted();

        const run: WhatsAppConnectionRun = {
            clock: this.options.clock ?? clock,
            signal,
            closed: false,
            retries: 0,
            failedAcquires: 0,
            heldReported: false,
            clearPending: false,
            // libsignal logs session keys to the console while a connection runs
            releaseConsole: guardConsole(),
        };

        this.current = run;
        this.notify('connecting');

        try {
            // an onStatus that closed the connection just now: there was no generation for that close to end
            if (run.closed) {
                throw new InvalidRunStateError('The WhatsApp connection closed while it connected.');
            }

            await this.establish(run, true);
        } catch (error) {
            this.setRunStatus(run, 'stopped');
            run.releaseConsole();

            throw error;
        }
    }

    reset(): Promise<void> {
        const run = this.current;

        if (!run || run.closed) {
            return Promise.reject(new InvalidRunStateError('The WhatsApp connection is not started; there is nothing to reset.'));
        }

        if (this.options.auth.supportsReset !== true) {
            return Promise.reject(resetUnsupported());
        }

        if (!run.resetting && this.status === 'held-elsewhere') {
            return Promise.reject(heldElsewhere());
        }

        run.resetting ??= (async () => {
            run.clearPending = true;
            run.retry?.clear();
            delete run.retry;
            run.retries = 0;
            run.failedAcquires = 0;

            const { generation } = run;

            if (generation?.lease) {
                this.setRunStatus(run, 'connecting');
            }

            if (generation) {
                await this.closeGeneration(generation);
            }

            // a retry scheduled while the close ran (a lost lease's) would build a second generation
            clearRetry(run);

            if (this.isRunCurrent(run)) {
                await this.establish(run, false);
            }

            if (this.isRunCurrent(run) && this.status === 'held-elsewhere') {
                throw heldElsewhere();
            }
        })().finally(() => {
            delete run.resetting;

            // the reset's own lease was lost and its close skipped the retry: waiting for the session is due now
            if (!(this.isRunCurrent(run) && run.generation?.leaseLost) || run.retry) {
                return;
            }

            run.clearPending = false;
            this.scheduleAcquire(run);
        });

        return run.resetting;
    }

    socket(): WhatsAppSocket | undefined {
        return this.current && !this.current.closed && this.status === 'connected' ? this.current.generation?.socket : undefined;
    }

    close(): Promise<void> {
        const run = this.current;

        if (!run) {
            return Promise.resolve();
        }

        run.closing ??= (async () => {
            // from here no retry, reset or reconnect starts a generation
            run.closed = true;
            run.retry?.clear();
            delete run.retry;
            this.notify('stopped');

            try {
                if (run.generation) {
                    await this.closeGeneration(run.generation);
                }

                await run.resetting;
            } finally {
                run.releaseConsole();
            }
        })();

        return run.closing;
    }
}
