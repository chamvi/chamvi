/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import { InvalidAgentDefinitionError, systemClock } from '@chamvi/core';
import { isObject } from 'smob';
import { MAIL_TIMEOUT_MS } from '../client/constants.ts';
import type { MailAccount } from '../client/types.ts';
import { ACCOUNT_ID_PATTERN, TIMER_MAX_MS } from './constants.ts';
import type { MailAccountNormalized } from './types.ts';

const SECURITY = ['tls', 'starttls', 'plain'] as const;

function nonEmpty(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

/** One account checked (never echoing a value: the password must not reach an error), with its defaults. */
export function normalizeAccount(account: unknown, field: string): MailAccountNormalized {
    if (!isObject(account)) {
        throw new InvalidAgentDefinitionError(`${field} must be an object.`);
    }

    const value = account as Partial<MailAccount>;

    if (!nonEmpty(value.id) || !ACCOUNT_ID_PATTERN.test(value.id)) {
        throw new InvalidAgentDefinitionError(`${field}.id must match ${ACCOUNT_ID_PATTERN.source}.`);
    }

    for (const name of ['host', 'user', 'password'] as const) {
        if (!nonEmpty(value[name])) {
            throw new InvalidAgentDefinitionError(`${field}.${name} must be a non-empty string.`);
        }
    }

    const security = value.security ?? 'tls';

    if (!SECURITY.includes(security)) {
        throw new InvalidAgentDefinitionError(`${field}.security must be one of ${SECURITY.join(', ')}.`);
    }

    const port = value.port ?? (security === 'tls' ? 993 : 143);

    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
        throw new InvalidAgentDefinitionError(`${field}.port must be an integer from 1 to 65535.`);
    }

    if (value.address !== undefined && !nonEmpty(value.address)) {
        throw new InvalidAgentDefinitionError(`${field}.address must be a non-empty string.`);
    }

    const folders = Array.isArray(value.folders) && value.folders.length > 0 && value.folders.every(nonEmpty);

    if (value.folders !== undefined && !folders) {
        throw new InvalidAgentDefinitionError(`${field}.folders must be a non-empty array of folder paths.`);
    }

    if (value.gmail !== undefined && typeof value.gmail !== 'boolean') {
        throw new InvalidAgentDefinitionError(`${field}.gmail must be a boolean.`);
    }

    return {
        id: value.id,
        host: value.host!,
        port,
        security,
        user: value.user!,
        password: value.password!,
        address: value.address ?? value.user!,
        ...(value.folders && { folders: [...value.folders] }),
        gmail: value.gmail ?? value.host === 'imap.gmail.com',
    };
}

/** The accounts checked (InvalidAgentDefinitionError naming the field, never a value). */
export function normalizeAccounts(accounts: unknown, caller: string): MailAccountNormalized[] {
    if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new InvalidAgentDefinitionError(`${caller} accounts must be a non-empty array.`);
    }

    const normalized = accounts.map((account, index) => normalizeAccount(account, `${caller} accounts[${index}]`));
    const ids = new Set<string>();

    for (const account of normalized) {
        if (ids.has(account.id)) {
            throw new InvalidAgentDefinitionError(`${caller} accounts hold the duplicate id ${account.id}.`);
        }

        ids.add(account.id);
    }

    return normalized;
}

/** The clock and the timeout checked, with their defaults. */
export function normalizeTiming(
    options: { clock?: IClock; timeoutMs?: number },
    caller: string,
): { clock: IClock; timeoutMs: number } {
    const clock = options.clock ?? systemClock;

    if (!isObject(clock) || typeof clock.now !== 'function' || typeof clock.setTimeout !== 'function') {
        throw new InvalidAgentDefinitionError(`${caller} clock must have now() and setTimeout().`);
    }

    const timeoutMs = options.timeoutMs ?? MAIL_TIMEOUT_MS;

    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TIMER_MAX_MS) {
        throw new InvalidAgentDefinitionError(`${caller} timeoutMs must be an integer from 1 to ${TIMER_MAX_MS}.`);
    }

    return { clock, timeoutMs };
}
