/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ClockTimer, IClock } from '@chamvi/core';
import { ChamviError } from '@chamvi/errors';
import { createTransport } from 'nodemailer';
import SMTPConnection from 'nodemailer/lib/smtp-connection';
import { isObject } from 'smob';
import { requestError } from '../client/asserts.ts';
import { MAIL_TIMEOUT_MS } from '../client/constants.ts';
import { MAIL_REQUEST_ERROR_CODE } from '../errors/constants.ts';
import type { MailEnvelope, MailSmtpAccount } from './types.ts';

const TIMED_OUT = Symbol('timed out');

const HANDED_OVER = 'timed out after the message was handed over; it may have been sent';

/** The nodemailer failures that mean the connection broke or stalled, not that the server refused. */
const CONNECTION_CODES = new Set(['ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'EDNS']);

/**
 * One transport per call, closed after it; the timeouts are a real-time backstop, the clock race decides.
 * `onHandedOver` is called once the message stream (DATA and its terminator) ended: the transport's logger is
 * the only place nodemailer reports it. The logger reads nothing else, stores nothing and never sees content
 * (`debug` stays off).
 */
function transportOf(account: MailSmtpAccount, timeoutMs: number, onHandedOver?: () => void) {
    const { security } = account.smtp;
    const logger = {
        info: (entry: unknown) => {
            if (isObject(entry) && entry.tnx === 'message' && 'outByteCount' in entry) {
                onHandedOver?.();
            }
        },
    };

    return createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: security === 'tls',
        requireTLS: security === 'starttls',
        ignoreTLS: security === 'plain',
        auth: { user: account.user, pass: account.password },
        connectionTimeout: timeoutMs,
        greetingTimeout: timeoutMs,
        socketTimeout: timeoutMs,
        logger: onHandedOver ? logger : false,
        debug: false,
        disableFileAccess: true,
        disableUrlAccess: true,
    });
}

/** The fixed reason of a nodemailer failure, never its text (which may quote the server). */
function reasonOf(error: unknown, handedOver: boolean): string {
    const code = (error as { code?: unknown } | undefined)?.code;

    if (typeof code === 'string' && CONNECTION_CODES.has(code)) {
        // after the hand-over a broken connection may have lost only the 250
        return handedOver ? HANDED_OVER : 'cannot connect';
    }

    switch (code) {
        case 'EAUTH':
            return 'login failed';
        case 'EENVELOPE':
            return 'recipient refused';
        default:
            return 'request failed';
    }
}

/**
 * Sends the raw message to `envelope` over SMTP, raced against `timeoutMs` on the clock and the signal (an
 * abort rethrows its reason). Failures are `requestError('mail_send', account, reason)` with a fixed reason; a
 * timeout, an abort or a broken connection after the message was handed over (before the server's 250) says it
 * may have been sent. Resolves with the lower-cased recipients the server refused.
 */
export async function sendSmtp(
    account: MailSmtpAccount,
    raw: Buffer,
    envelope: MailEnvelope,
    timing: { clock: IClock; timeoutMs: number },
    signal?: AbortSignal,
): Promise<Set<string>> {
    signal?.throwIfAborted();

    let handedOver = false;
    const controller = new AbortController();
    const transport = transportOf(account, timing.timeoutMs, () => {
        handedOver = true;
    });
    let timer: ClockTimer | undefined;
    let onAbort: (() => void) | undefined;
    const interrupted = new Promise<never>((_, reject) => {
        timer = timing.clock.setTimeout(() => reject(TIMED_OUT), timing.timeoutMs);
        timer.unref?.();
        onAbort = () => reject(signal?.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
    });

    interrupted.catch(() => undefined);

    const sending = transport.sendMail({
        envelope,
        raw,
        signal: controller.signal,
    });

    // a send that lost the race settles later, unobserved
    sending.catch(() => undefined);

    try {
        const info = await Promise.race([sending, interrupted]);

        return new Set((info.rejected ?? []).map((address) => String(address).toLowerCase()));
    } catch (error) {
        controller.abort();

        if (handedOver && (error === TIMED_OUT || signal?.aborted)) {
            throw requestError('mail_send', account.id, HANDED_OVER);
        }

        if (error === TIMED_OUT) {
            throw requestError('mail_send', account.id, 'timed out');
        }

        if (signal?.aborted) {
            throw signal.reason;
        }

        throw requestError('mail_send', account.id, reasonOf(error, handedOver));
    } finally {
        timer?.clear();

        if (onAbort) {
            signal?.removeEventListener('abort', onAbort);
        }

        transport.close();
    }
}

function failure(message: string): ChamviError {
    return new ChamviError({ message, code: MAIL_REQUEST_ERROR_CODE });
}

/**
 * Logs in to the account's SMTP server and quits: nothing is sent. Bounded by `signal`, which closes the
 * transport. The failures are a fixed set of sentences, never the server's text.
 */
export async function verifySmtpLogin(account: MailSmtpAccount, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();

    const { security } = account.smtp;
    // its own connection (not a transport's verify()), so an abort closes the socket it opened
    const connection = new SMTPConnection({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: security === 'tls',
        requireTLS: security === 'starttls',
        ignoreTLS: security === 'plain',
        connectionTimeout: MAIL_TIMEOUT_MS,
        greetingTimeout: MAIL_TIMEOUT_MS,
        socketTimeout: MAIL_TIMEOUT_MS,
        logger: false,
        debug: false,
    });
    let onAbort: (() => void) | undefined;
    let quit = false;

    try {
        await new Promise<void>((resolve, reject) => {
            onAbort = () => reject(signal.reason);
            signal.addEventListener('abort', onAbort, { once: true });
            // every error (also one after the quit) is handled here
            connection.on('error', reject);
            connection.once('end', () => reject(new Error('Connection closed')));
            connection.connect((error) => {
                if (error) {
                    reject(error);

                    return;
                }

                // a server that offers no AUTH has nothing to log in to (as nodemailer's verify())
                if (!connection.allowsAuth) {
                    quit = true;
                    connection.quit();
                    resolve();

                    return;
                }

                connection.login({ user: account.user, pass: account.password }, (failed) => {
                    if (failed) {
                        reject(failed);

                        return;
                    }

                    quit = true;
                    connection.quit();
                    resolve();
                });
            });
        });
    } catch (error) {
        signal.throwIfAborted();

        throw failure((error as { code?: unknown }).code === 'EAUTH' ?
            'The SMTP server refused the user or password.' :
            'The SMTP server cannot be reached.');
    } finally {
        if (onAbort) {
            signal.removeEventListener('abort', onAbort);
        }

        // a failed or aborted login closes the socket now; a quit one closes after the server's answer
        if (!quit) {
            connection.close();
        }
    }
}
