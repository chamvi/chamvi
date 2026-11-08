/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { DisconnectReason } from 'baileys';
import type {
    BaileysEventMap,
    SignalDataSet,
    SignalDataTypeMap,
    SignalKeyStore,
} from 'baileys';
import { ChamviError, ErrorCode, InvalidRunStateError } from '@chamvi/core';
import type { IClock } from '@chamvi/core';
import { isObject } from 'smob';
import {
    WHATSAPP_AUTH_ERROR_CODE,
    WHATSAPP_CONNECTION_ERROR_CODE,
    WHATSAPP_LOGGED_OUT_ERROR_CODE,
    WHATSAPP_RECONNECT,
    WHATSAPP_SHUTDOWN_TIMEOUT_MS,
} from './constants.ts';
import type {
    WhatsAppAuthLease,
    WhatsAppConnection,
    WhatsAppConnectionOptions,
    WhatsAppConnectionStatus,
    WhatsAppSocket,
} from './types.ts';

/**
 * One acquisition of the lease: every auth callback of its sockets is
 * admitted only while it is in use, so nothing writes under an ended one.
 */
type Generation = {
    readonly run: Run;
    /** aborts with the run's signal, or when this generation closes */
    readonly controller: AbortController;
    readonly signal: AbortSignal;
    /** auth calls are admitted (reads and writes) */
    admitting: boolean;
    /** close began: no socket, no reconnect from here on */
    closed: boolean;
    readonly writes: Set<Promise<unknown>>;
    lease?: WhatsAppAuthLease;
    /** the provider reported the lease lost: nothing is flushed under it */
    leaseLost: boolean;
    /** acquired for a reset: the provider handed out an emptied session */
    reset: boolean;
    /** settles once acquire settled and a late lease was released */
    acquiring?: Promise<void>;
    socket?: WhatsAppSocket;
    detach?: () => void;
    timer?: { clear(): void };
    /** failed reconnect attempts in a row */
    failures: number;
    closing?: Promise<void>;
};

/** One connect until its close: the generations one after the other, and the acquire retries between them. */
type Run = {
    readonly clock: IClock;
    readonly signal: AbortSignal;
    closed: boolean;
    generation?: Generation;
    /** the pending acquire retry */
    retry?: { clear(): void };
    /** acquire retries since the last acquired lease (the backoff step) */
    retries: number;
    /** failed (not held) acquires since the last acquired lease */
    failedAcquires: number;
    /** the held-elsewhere notice went out since the last acquired lease */
    heldReported: boolean;
    /** a reset asked for a cleared session: the next acquire asks the provider for it, before any socket */
    clearPending: boolean;
    resetting?: Promise<void>;
    closing?: Promise<void>;
};

/** Drops everything: Baileys' own log lines would otherwise carry pairing material and session details. */
const SILENT_LOGGER = {
    level: 'silent',
    child: () => SILENT_LOGGER,
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
};

function failure(code: string, message: string, cause?: unknown): ChamviError {
    return new ChamviError({
        code,
        message,
        ...(cause !== undefined ? { cause } : {}),
    });
}

/** The status code of a close (a Boom's `output.statusCode`), if any. */
function statusCodeOf(error: unknown): number | undefined {
    if (isObject(error) && isObject(error.output) && typeof error.output.statusCode === 'number') {
        return error.output.statusCode;
    }

    return undefined;
}

/** The wait before reconnect attempt `n` (0-based), see WHATSAPP_RECONNECT. */
function backoff(n: number): number {
    const base = Math.min(WHATSAPP_RECONNECT.maxMs, WHATSAPP_RECONNECT.initialMs * WHATSAPP_RECONNECT.factor ** n);
    const scaled = base * (1 + WHATSAPP_RECONNECT.jitter * (2 * Math.random() - 1));

    return Math.max(1, Math.min(WHATSAPP_RECONNECT.maxMs, Math.round(scaled)));
}

/** `promise`, or the signal's reason once it aborts first. */
export function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason);

        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener('abort', onAbort);
                reject(error);
            },
        );
    });
}

/** Whether `work` settled within `ms` on the clock; its rejection rethrown. */
async function within(clock: IClock, ms: number, work: Promise<void>): Promise<boolean> {
    let timer: { clear(): void } | undefined;
    const timeout = new Promise<false>((resolve) => {
        timer = clock.setTimeout(() => resolve(false), ms);
    });

    try {
        return await Promise.race([work.then(() => true as const), timeout]);
    } finally {
        timer?.clear();
    }
}

/**
 * Runs an auth call of the generation, tracked until it settles; refused
 * (InvalidRunStateError) once the generation stopped admitting.
 */
function admit<T>(generation: Generation, call: () => T | Promise<T>): Promise<T> {
    if (!generation.admitting) {
        return Promise.reject(new InvalidRunStateError('The WhatsApp auth lease of this connection has ended; the auth call is refused.'));
    }

    let task: Promise<T>;

    try {
        task = Promise.resolve(call());
    } catch (error) {
        task = Promise.reject(error);
    }

    generation.writes.add(task);

    const forget = () => generation.writes.delete(task);

    task.then(forget, forget);

    return task;
}

/** The lease's key store behind the generation guard: Baileys gets this one only. */
function guardKeys(generation: Generation, keys: SignalKeyStore): SignalKeyStore {
    return {
        get: <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => admit(generation, () => keys.get(type, ids)),
        set: (data: SignalDataSet) => admit(generation, () => keys.set(data)),
        ...(keys.clear ? { clear: () => admit(generation, () => keys.clear!()) } : {}),
    };
}

/** Whether an acquire failure says another holder has the session (the vault's ConnectionHeldError, by code). */
function isHeld(error: unknown): boolean {
    return isObject(error) && error.code === ErrorCode.CONNECTION_HELD;
}

const noop = () => undefined;

function clearRetry(run: Run): void {
    run.retry?.clear();
    delete run.retry;
}

/** The refusal of a reset the provider cannot perform: it would hand the old session back. */
function resetUnsupported(): InvalidRunStateError {
    return new InvalidRunStateError('The WhatsApp auth provider does not support a reset (no supportsReset); the session was not reset.');
}

/** The refusal of a reset while another process holds the session: nothing is cleared, nothing queued. */
function heldElsewhere(): InvalidRunStateError {
    return new InvalidRunStateError('The WhatsApp session is held by another process; the reset is refused and nothing is cleared. Retry once this process holds the session.');
}

/**
 * The WhatsApp connection: `connect` acquires the lease (the provider's
 * exclusivity), then builds a socket over it; Baileys' connection events
 * alone set the status (`pairing` while a QR is outstanding). An unexpected
 * close reconnects with backoff on the clock; a logout or a replacing
 * session does not.
 *
 * `connect` resolves once its first acquire settled: a refused acquire
 * (ConnectionHeldError, by code) sets `held-elsewhere` and retries on the
 * clock with the WHATSAPP_RECONNECT backoff and no attempt cap; any other
 * acquire failure sets `failed` and retries up to `maxAttempts`. A lease the
 * provider reports lost ends the socket and waits for the session the same
 * way. `reset` closes the current generation (socket, flush, release), then
 * acquires again with `reset: true`: the provider empties the session only
 * once it holds the location (the store provider recreates the connection,
 * which also recovers a data key the keyring cannot unwrap), then the fresh
 * creds are saved before the socket. A reset is refused (InvalidRunStateError)
 * by a provider without `supportsReset`, while the status is `held-elsewhere`,
 * and when its own acquire finds the session held: no clear waits for another
 * holder's lease.
 *
 * `close` (idempotent per connect) stops admitting auth calls and ends the
 * retries and reconnects, then has two bounds of WHATSAPP_SHUTDOWN_TIMEOUT_MS
 * (30 s) each: ending the socket (past it the end is abandoned and reported,
 * and the close goes on), then settling (the auth calls already admitted and
 * the lease's flush), after which it releases the lease. A failed flush is
 * reported and the lease released all the same (the failed writes are lost
 * and fenced); past the settling bound the timeout is reported and the lease
 * released once the admitted writes settle.
 */
export function createWhatsAppConnection(options: WhatsAppConnectionOptions): WhatsAppConnection {
    let current: Run | undefined;
    let status: WhatsAppConnectionStatus = 'stopped';

    const report = (error: unknown) => {
        try {
            options.onError(error);
        } catch {
            // a throwing onError must not break the connection's bookkeeping
        }
    };

    const notify = (next: WhatsAppConnectionStatus) => {
        if (status === next) {
            return;
        }

        status = next;

        if (options.onStatus) {
            try {
                options.onStatus(next);
            } catch {
                report(failure(WHATSAPP_CONNECTION_ERROR_CODE, 'onStatus threw; the status change stands.'));
            }
        }
    };

    const isRunCurrent = (run: Run) => current === run && !run.closed;

    const isCurrent = (generation: Generation, socket?: WhatsAppSocket) => isRunCurrent(generation.run) &&
        generation.run.generation === generation &&
        !generation.closed &&
        (socket === undefined || generation.socket === socket);

    const setRunStatus = (run: Run, next: WhatsAppConnectionStatus) => {
        if (current === run) {
            notify(next);
        }
    };

    const setStatus = (generation: Generation, next: WhatsAppConnectionStatus) => {
        if (isCurrent(generation)) {
            notify(next);
        }
    };

    const release = async (lease: WhatsAppAuthLease) => {
        try {
            await lease.release();
        } catch (error) {
            report(failure(WHATSAPP_AUTH_ERROR_CODE, 'Releasing the WhatsApp auth lease failed.', error));
        }
    };

    let scheduleReconnect: (generation: Generation) => void = noop;
    let scheduleAcquire: (run: Run) => void = noop;

    const dropSocket = (generation: Generation) => {
        generation.detach?.();
        delete generation.detach;
        delete generation.socket;
    };

    const onClose = (generation: Generation, code: number | undefined) => {
        dropSocket(generation);

        if (code === DisconnectReason.loggedOut) {
            setStatus(generation, 'logged-out');
            report(failure(WHATSAPP_LOGGED_OUT_ERROR_CODE, 'WhatsApp logged this device out: reset the session and pair the account again; nothing reconnects.'));

            return;
        }

        setStatus(generation, 'disconnected');

        if (code === DisconnectReason.connectionReplaced) {
            report(failure(WHATSAPP_CONNECTION_ERROR_CODE, 'Another client replaced this WhatsApp session; nothing reconnects (one connector per account).'));

            return;
        }

        scheduleReconnect(generation);
    };

    const createSocket = (generation: Generation) => {
        const lease = generation.lease!;
        const socket = options.socketFactory({
            ...options.socketOptions,
            auth: {
                creds: lease.auth.creds,
                keys: guardKeys(generation, lease.auth.keys),
            },
            logger: SILENT_LOGGER,
        });

        const onUpdate = (update: BaileysEventMap['connection.update']) => {
            if (!isCurrent(generation, socket)) {
                return;
            }

            if (typeof update.qr === 'string' && update.qr.length > 0) {
                try {
                    options.onPairing({ qr: update.qr });
                } catch {
                    // its error could carry the material: reported without it
                    report(failure(WHATSAPP_CONNECTION_ERROR_CODE, 'onPairing threw; the pairing material was not handed on.'));
                }

                setStatus(generation, 'pairing');
            }

            if (update.connection === 'open') {
                generation.failures = 0;
                setStatus(generation, 'connected');
            } else if (update.connection === 'connecting') {
                setStatus(generation, 'connecting');
            } else if (update.connection === 'close') {
                onClose(generation, statusCodeOf(update.lastDisconnect?.error));
            }
        };

        const onCreds = () => {
            if (!generation.admitting) {
                return;
            }

            admit(generation, () => lease.saveCreds()).catch((error: unknown) => {
                report(failure(WHATSAPP_AUTH_ERROR_CODE, 'Saving the WhatsApp creds failed.', error));
            });
        };

        const onMessages = (upsert: BaileysEventMap['messages.upsert']) => {
            if (isCurrent(generation, socket)) {
                options.onMessages(socket, upsert);
            }
        };

        socket.ev.on('connection.update', onUpdate);
        socket.ev.on('creds.update', onCreds);
        socket.ev.on('messages.upsert', onMessages);
        generation.socket = socket;
        generation.detach = () => {
            socket.ev.off('connection.update', onUpdate);
            socket.ev.off('creds.update', onCreds);
            socket.ev.off('messages.upsert', onMessages);
        };
    };

    scheduleReconnect = (generation: Generation) => {
        if (generation.failures >= WHATSAPP_RECONNECT.maxAttempts) {
            report(failure(WHATSAPP_CONNECTION_ERROR_CODE, `WhatsApp did not reconnect after ${WHATSAPP_RECONNECT.maxAttempts} attempts; restart the channel to try again.`));

            return;
        }

        const delay = backoff(generation.failures);

        generation.failures += 1;
        generation.timer = generation.run.clock.setTimeout(() => {
            delete generation.timer;

            if (!isCurrent(generation)) {
                return;
            }

            setStatus(generation, 'connecting');

            try {
                createSocket(generation);
            } catch (error) {
                report(failure(WHATSAPP_CONNECTION_ERROR_CODE, 'Creating the WhatsApp socket failed.', error));
                setStatus(generation, 'disconnected');
                scheduleReconnect(generation);
            }
        }, delay);
    };

    const closeGeneration = (generation: Generation): Promise<void> => {
        generation.closing ??= (async () => {
            generation.closed = true;
            generation.admitting = false;
            generation.controller.abort(new InvalidRunStateError('The WhatsApp connection closed.'));
            generation.timer?.clear();
            delete generation.timer;

            const { socket } = generation;
            const { clock } = generation.run;

            dropSocket(generation);

            if (socket) {
                const ending = (async () => {
                    await socket.end(undefined);
                })();

                try {
                    if (!await within(clock, WHATSAPP_SHUTDOWN_TIMEOUT_MS, ending)) {
                        ending.catch(noop);
                        report(failure(WHATSAPP_CONNECTION_ERROR_CODE, `Ending the WhatsApp socket did not finish within ${WHATSAPP_SHUTDOWN_TIMEOUT_MS}ms.`));
                    }
                } catch (error) {
                    report(failure(WHATSAPP_CONNECTION_ERROR_CODE, 'Ending the WhatsApp socket failed.', error));
                }
            }

            // a write admitted before the close finishes, then the lease flushes it; admission closed above,
            // so this phase gets its own bound: a dead link's end() never eats into it. A lost lease flushes
            // nothing (its writes are refused anyway) and is handed back at once.
            const settling = (async () => {
                await generation.acquiring;
                await Promise.allSettled([...generation.writes]);

                if (!generation.leaseLost) {
                    await generation.lease?.flush();
                }
            })();

            // the session ends once the admitted writes settled, whatever the flush said: a failed write is
            // already lost (and fenced), so keeping the lease for it would only block the next session
            const end = async () => {
                if (generation.lease) {
                    await release(generation.lease);
                }
            };

            let settled: boolean;

            try {
                settled = await within(clock, WHATSAPP_SHUTDOWN_TIMEOUT_MS, settling);
            } catch (error) {
                report(failure(WHATSAPP_AUTH_ERROR_CODE, 'Flushing the WhatsApp auth lease failed; the failed writes are lost, the lease is released.', error));
                await end();

                return;
            }

            if (!settled) {
                report(failure(
                    WHATSAPP_AUTH_ERROR_CODE,
                    `The WhatsApp auth writes did not finish within ${WHATSAPP_SHUTDOWN_TIMEOUT_MS}ms; the lease is released once they settle.`,
                ));
                void settling.then(end, end);

                return;
            }

            await end();
        })();

        return generation.closing;
    };

    /** A refused or failed acquire (or a session clear that failed under the lease): the status, then a retry. */
    const onAcquireFailed = (run: Run, error: unknown, message: string) => {
        if (!isRunCurrent(run)) {
            return;
        }

        if (isHeld(error)) {
            // a reset's clear never waits for the lease: it would wipe the holder's session later
            run.clearPending = false;
            setRunStatus(run, 'held-elsewhere');

            if (!run.heldReported) {
                run.heldReported = true;
                report(failure(WHATSAPP_AUTH_ERROR_CODE, 'The WhatsApp session is held by another process; retrying until its lease is free.'));
            }

            scheduleAcquire(run);

            return;
        }

        run.failedAcquires += 1;
        setRunStatus(run, 'failed');
        report(failure(WHATSAPP_AUTH_ERROR_CODE, message, error));

        if (run.failedAcquires > WHATSAPP_RECONNECT.maxAttempts) {
            report(failure(
                WHATSAPP_CONNECTION_ERROR_CODE,
                `Acquiring the WhatsApp session failed ${run.failedAcquires} times in a row; reset or restart the channel to try again.`,
            ));

            return;
        }

        scheduleAcquire(run);
    };

    const onLost = (generation: Generation) => {
        if (!isCurrent(generation)) {
            return;
        }

        const { run } = generation;

        generation.leaseLost = true;
        report(failure(WHATSAPP_AUTH_ERROR_CODE, 'The WhatsApp session lease was lost; the socket ends and the connection waits for the session again.'));
        setStatus(generation, 'held-elsewhere');

        void closeGeneration(generation).then(() => {
            // a reset that began meanwhile acquires on its own
            if (isRunCurrent(run) && run.generation === generation && !run.resetting) {
                scheduleAcquire(run);
            }
        });
    };

    /**
     * One acquire: the generation holding its lease, or undefined when the
     * acquire failed (status and retry are set). Rejects once the generation
     * aborted (a close, a stop or a reset).
     */
    const acquireGeneration = async (run: Run): Promise<Generation | undefined> => {
        const controller = new AbortController();
        const generation: Generation = {
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
            const lease = await options.auth.acquire(generation.signal, { reset: generation.reset });

            // a lease that arrives after the stop is given back at once, never used
            if (generation.closed || generation.signal.aborted) {
                await release(lease);

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
            onAcquireFailed(run, error, 'Acquiring the WhatsApp session failed; the connection retries.');

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
        lease.lost?.then(() => onLost(generation), noop);

        return generation;
    };

    /** Under the reset's lease, before the socket: the emptied session's fresh creds are saved. */
    const saveFreshCreds = async (generation: Generation) => {
        const lease = generation.lease!;

        await admit(generation, () => lease.saveCreds());
        generation.run.clearPending = false;
        generation.run.retries = 0;
        generation.run.failedAcquires = 0;
    };

    /**
     * Acquires, clears when a reset asked for it, then builds the socket. The
     * first establish of a connect rethrows an abort or a socket failure (the
     * start fails); later ones report and retry.
     */
    const establish = async (run: Run, first: boolean): Promise<void> => {
        // a live generation (acquiring or holding its lease) stays the only one
        if (run.generation && !run.generation.closed) {
            return;
        }

        let generation: Generation | undefined;

        try {
            generation = await acquireGeneration(run);
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
            setStatus(generation, 'connecting');
        }

        if (generation.reset) {
            try {
                await saveFreshCreds(generation);
            } catch (error) {
                if (generation.closed) {
                    return;
                }

                await closeGeneration(generation);
                onAcquireFailed(run, error, 'Saving the reset WhatsApp session failed; the connection retries.');

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
            createSocket(generation);
        } catch (error) {
            if (first) {
                throw error;
            }

            report(failure(WHATSAPP_CONNECTION_ERROR_CODE, 'Creating the WhatsApp socket failed.', error));
            setStatus(generation, 'disconnected');
            scheduleReconnect(generation);
        }
    };

    scheduleAcquire = (run: Run) => {
        const delay = backoff(run.retries);

        run.retries += 1;
        run.retry = run.clock.setTimeout(() => {
            delete run.retry;

            if (isRunCurrent(run)) {
                void establish(run, false);
            }
        }, delay);
    };

    const connect = async ({ signal, clock }: { signal: AbortSignal; clock: IClock }): Promise<void> => {
        if (current && !current.closed) {
            throw new InvalidRunStateError('The WhatsApp connection is already connected.');
        }

        // a close still settling (flush, release) finishes before the next lease is taken
        await current?.closing;
        // an aborted connect never becomes the current run
        signal.throwIfAborted();

        const run: Run = {
            clock: options.clock ?? clock,
            signal,
            closed: false,
            retries: 0,
            failedAcquires: 0,
            heldReported: false,
            clearPending: false,
        };

        current = run;
        notify('connecting');

        try {
            // an onStatus that closed the connection just now: there was no generation for that close to end
            if (run.closed) {
                throw new InvalidRunStateError('The WhatsApp connection closed while it connected.');
            }

            await establish(run, true);
        } catch (error) {
            setRunStatus(run, 'stopped');

            throw error;
        }
    };

    const reset = (): Promise<void> => {
        const run = current;

        if (!run || run.closed) {
            return Promise.reject(new InvalidRunStateError('The WhatsApp connection is not started; there is nothing to reset.'));
        }

        if (options.auth.supportsReset !== true) {
            return Promise.reject(resetUnsupported());
        }

        if (!run.resetting && status === 'held-elsewhere') {
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
                setRunStatus(run, 'connecting');
            }

            if (generation) {
                await closeGeneration(generation);
            }

            // a retry scheduled while the close ran (a lost lease's) would build a second generation
            clearRetry(run);

            if (isRunCurrent(run)) {
                await establish(run, false);
            }

            if (isRunCurrent(run) && status === 'held-elsewhere') {
                throw heldElsewhere();
            }
        })().finally(() => {
            delete run.resetting;
        });

        return run.resetting;
    };

    return {
        status: () => status,
        socket: () => (current && !current.closed && status === 'connected' ? current.generation?.socket : undefined),
        connect,
        reset,
        close() {
            const run = current;

            if (!run) {
                return Promise.resolve();
            }

            run.closing ??= (async () => {
                // from here no retry, reset or reconnect starts a generation
                run.closed = true;
                run.retry?.clear();
                delete run.retry;
                notify('stopped');

                if (run.generation) {
                    await closeGeneration(run.generation);
                }

                await run.resetting;
            })();

            return run.closing;
        },
    };
}
