/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ClockTimer, IClock } from '@chamvi/core';
import { ChamviError } from '@chamvi/core';
import { createTransport } from 'nodemailer';
import { requestError } from '../client/asserts.ts';
import { MAIL_TIMEOUT_MS } from '../client/constants.ts';
import { MAIL_REQUEST_ERROR_CODE } from '../errors/constants.ts';
import type { MailEnvelope, MailSmtpAccount } from './types.ts';

const TIMED_OUT = Symbol('timed out');

/** One transport per call, closed after it; the timeouts are a real-time backstop, the clock race decides. */
function transportOf(account: MailSmtpAccount, timeoutMs: number) {
    const { security } = account.smtp;

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
        logger: false,
        debug: false,
        disableFileAccess: true,
        disableUrlAccess: true,
    });
}

/** The fixed reason of a nodemailer failure, never its text (which may quote the server). */
function reasonOf(error: unknown): string {
    switch ((error as { code?: unknown } | undefined)?.code) {
        case 'EAUTH':
            return 'login failed';
        case 'ECONNECTION':
        case 'ESOCKET':
        case 'ETIMEDOUT':
        case 'EDNS':
            return 'cannot connect';
        case 'EENVELOPE':
            return 'recipient refused';
        default:
            return 'request failed';
    }
}

/**
 * Sends the raw message to `envelope` over SMTP, raced against `timeoutMs` on the clock and the signal (an
 * abort rethrows its reason). Failures are `requestError('mail_send', account, reason)` with a fixed reason.
 */
export async function sendSmtp(
    account: MailSmtpAccount,
    raw: Buffer,
    envelope: MailEnvelope,
    timing: { clock: IClock; timeoutMs: number },
    signal?: AbortSignal,
): Promise<void> {
    signal?.throwIfAborted();

    const controller = new AbortController();
    const transport = transportOf(account, timing.timeoutMs);
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
        await Promise.race([sending, interrupted]);
    } catch (error) {
        controller.abort();

        if (error === TIMED_OUT) {
            throw requestError('mail_send', account.id, 'timed out');
        }

        if (signal?.aborted) {
            throw signal.reason;
        }

        throw requestError('mail_send', account.id, reasonOf(error));
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

    const transport = transportOf(account, MAIL_TIMEOUT_MS);
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
    });
    const verifying = transport.verify();

    verifying.catch(() => undefined);

    try {
        await Promise.race([verifying, aborted]);
    } catch (error) {
        signal.throwIfAborted();

        throw failure((error as { code?: unknown }).code === 'EAUTH' ?
            'The SMTP server refused the user or password.' :
            'The SMTP server cannot be reached.');
    } finally {
        if (onAbort) {
            signal.removeEventListener('abort', onAbort);
        }

        transport.close();
    }
}
