/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { DisconnectReason } from 'baileys';
import type { BaileysEventMap } from 'baileys';
import { InvalidRunStateError } from '@chamvi/core';
import {
    WHATSAPP_AUTH_ERROR_CODE,
    WHATSAPP_CONNECTION_ERROR_CODE,
    WHATSAPP_LOGGED_OUT_ERROR_CODE,
    WHATSAPP_RECONNECT,
    WHATSAPP_SHUTDOWN_TIMEOUT_MS,
} from './constants.ts';
import {
    admit,
    backoff,
    failure,
    guardKeys,
    noop,
    statusCodeOf,
    within,
} from './helpers/index.ts';
import type {
    WhatsAppAuthLease,
    WhatsAppConnectionOptions,
    WhatsAppConnectionRun,
    WhatsAppConnectionStatus,
    WhatsAppGeneration,
    WhatsAppSocket,
} from './types.ts';

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

/**
 * The state of one WhatsApp connection and its lease generations: the
 * status, the socket of a generation, its reconnects and its close.
 * `WhatsAppSession` acquires the generations on top of it.
 */
export class WhatsAppGenerations {
    protected readonly options: WhatsAppConnectionOptions;

    protected current: WhatsAppConnectionRun | undefined;

    status: WhatsAppConnectionStatus = 'stopped';

    constructor(options: WhatsAppConnectionOptions) {
        this.options = options;
    }

    protected report(error: unknown) {
        try {
            this.options.onError(error);
        } catch {
            // a throwing onError must not break the connection's bookkeeping
        }
    }

    protected notify(next: WhatsAppConnectionStatus) {
        if (this.status === next) {
            return;
        }

        this.status = next;

        if (this.options.onStatus) {
            try {
                this.options.onStatus(next);
            } catch {
                this.report(failure(WHATSAPP_CONNECTION_ERROR_CODE, 'onStatus threw; the status change stands.'));
            }
        }
    }

    protected isRunCurrent(run: WhatsAppConnectionRun): boolean {
        return this.current === run && !run.closed;
    }

    protected isCurrent(generation: WhatsAppGeneration, socket?: WhatsAppSocket): boolean {
        return this.isRunCurrent(generation.run) &&
            generation.run.generation === generation &&
            !generation.closed &&
            (socket === undefined || generation.socket === socket);
    }

    protected setRunStatus(run: WhatsAppConnectionRun, next: WhatsAppConnectionStatus) {
        if (this.current === run) {
            this.notify(next);
        }
    }

    protected setStatus(generation: WhatsAppGeneration, next: WhatsAppConnectionStatus) {
        if (this.isCurrent(generation)) {
            this.notify(next);
        }
    }

    protected async release(lease: WhatsAppAuthLease) {
        try {
            await lease.release();
        } catch (error) {
            this.report(failure(WHATSAPP_AUTH_ERROR_CODE, 'Releasing the WhatsApp auth lease failed.', error));
        }
    }

    protected dropSocket(generation: WhatsAppGeneration) {
        generation.detach?.();
        delete generation.detach;
        delete generation.socket;
    }

    protected onClose(generation: WhatsAppGeneration, code: number | undefined) {
        this.dropSocket(generation);

        if (code === DisconnectReason.loggedOut) {
            this.setStatus(generation, 'logged-out');
            this.report(failure(WHATSAPP_LOGGED_OUT_ERROR_CODE, 'WhatsApp logged this device out: reset the session and pair the account again; nothing reconnects.'));

            return;
        }

        this.setStatus(generation, 'disconnected');

        if (code === DisconnectReason.connectionReplaced) {
            this.report(failure(WHATSAPP_CONNECTION_ERROR_CODE, 'Another client replaced this WhatsApp session; nothing reconnects (one connector per account).'));

            return;
        }

        this.scheduleReconnect(generation);
    }

    protected createSocket(generation: WhatsAppGeneration) {
        const lease = generation.lease!;
        const socket = this.options.socketFactory({
            ...this.options.socketOptions,
            auth: {
                creds: lease.auth.creds,
                keys: guardKeys(generation, lease.auth.keys),
            },
            logger: SILENT_LOGGER,
        });

        const onUpdate = (update: BaileysEventMap['connection.update']) => {
            if (!this.isCurrent(generation, socket)) {
                return;
            }

            if (typeof update.qr === 'string' && update.qr.length > 0) {
                try {
                    this.options.onPairing({ qr: update.qr });
                } catch {
                    // its error could carry the material: reported without it
                    this.report(failure(WHATSAPP_CONNECTION_ERROR_CODE, 'onPairing threw; the pairing material was not handed on.'));
                }

                this.setStatus(generation, 'pairing');
            }

            if (update.connection === 'open') {
                generation.failures = 0;
                this.setStatus(generation, 'connected');
            } else if (update.connection === 'connecting') {
                this.setStatus(generation, 'connecting');
            } else if (update.connection === 'close') {
                this.onClose(generation, statusCodeOf(update.lastDisconnect?.error));
            }
        };

        const onCreds = () => {
            if (!generation.admitting) {
                return;
            }

            admit(generation, () => lease.saveCreds()).catch((error: unknown) => {
                this.report(failure(WHATSAPP_AUTH_ERROR_CODE, 'Saving the WhatsApp creds failed.', error));
            });
        };

        const onMessages = (upsert: BaileysEventMap['messages.upsert']) => {
            if (this.isCurrent(generation, socket)) {
                this.options.onMessages(socket, upsert);
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
    }

    protected scheduleReconnect(generation: WhatsAppGeneration) {
        if (generation.failures >= WHATSAPP_RECONNECT.maxAttempts) {
            this.report(failure(WHATSAPP_CONNECTION_ERROR_CODE, `WhatsApp did not reconnect after ${WHATSAPP_RECONNECT.maxAttempts} attempts; restart the channel to try again.`));

            return;
        }

        const delay = backoff(generation.failures);

        generation.failures += 1;
        generation.timer = generation.run.clock.setTimeout(() => {
            delete generation.timer;

            if (!this.isCurrent(generation)) {
                return;
            }

            this.setStatus(generation, 'connecting');

            try {
                this.createSocket(generation);
            } catch (error) {
                this.report(failure(WHATSAPP_CONNECTION_ERROR_CODE, 'Creating the WhatsApp socket failed.', error));
                this.setStatus(generation, 'disconnected');
                this.scheduleReconnect(generation);
            }
        }, delay);
        generation.timer.unref?.();
    }

    protected closeGeneration(generation: WhatsAppGeneration): Promise<void> {
        generation.closing ??= (async () => {
            generation.closed = true;
            generation.admitting = false;
            generation.controller.abort(new InvalidRunStateError('The WhatsApp connection closed.'));
            generation.timer?.clear();
            delete generation.timer;

            const { socket } = generation;
            const { clock } = generation.run;

            this.dropSocket(generation);

            if (socket) {
                const ending = (async () => {
                    await socket.end(undefined);
                })();

                try {
                    if (!await within(clock, WHATSAPP_SHUTDOWN_TIMEOUT_MS, ending)) {
                        ending.catch(noop);
                        this.report(failure(WHATSAPP_CONNECTION_ERROR_CODE, `Ending the WhatsApp socket did not finish within ${WHATSAPP_SHUTDOWN_TIMEOUT_MS}ms.`));
                    }
                } catch (error) {
                    this.report(failure(WHATSAPP_CONNECTION_ERROR_CODE, 'Ending the WhatsApp socket failed.', error));
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
                    await this.release(generation.lease);
                }
            };

            let settled: boolean;

            try {
                settled = await within(clock, WHATSAPP_SHUTDOWN_TIMEOUT_MS, settling);
            } catch (error) {
                this.report(failure(WHATSAPP_AUTH_ERROR_CODE, 'Flushing the WhatsApp auth lease failed; the failed writes are lost, the lease is released.', error));
                await end();

                return;
            }

            if (!settled) {
                this.report(failure(
                    WHATSAPP_AUTH_ERROR_CODE,
                    `The WhatsApp auth writes did not finish within ${WHATSAPP_SHUTDOWN_TIMEOUT_MS}ms; the lease is released once they settle.`,
                ));
                void settling.then(end, end);

                return;
            }

            await end();
        })();

        return generation.closing;
    }
}
