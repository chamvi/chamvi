/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError, systemClock } from '@chamvi/core';
import { isObject } from 'smob';
import type { CalendarAccount } from '../client/types.ts';
import { CALENDAR_DEFAULT_TIMEZONE, CALENDAR_TIMEOUT_MS, TIMER_MAX_MS } from './constants.ts';
import type { CalendarClientOptions, CalendarClientOptionsNormalized } from './types.ts';

const ACCOUNT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** An IANA zone id (or `UTC`). */
export function isTimeZone(value: unknown): value is string {
    return typeof value === 'string' && (value === 'UTC' || Intl.supportedValuesOf('timeZone').includes(value));
}

function nonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

/** The accounts checked (InvalidAgentDefinitionError); never echoes a password. */
export function normalizeAccounts(accounts: unknown): CalendarAccount[] {
    if (!Array.isArray(accounts)) {
        throw new InvalidAgentDefinitionError('calendar accounts must be an array.');
    }

    const ids = new Set<string>();

    return accounts.map((account: unknown, index) => {
        if (!isObject(account)) {
            throw new InvalidAgentDefinitionError(`calendar account ${index} must be an object.`);
        }

        const {
            id,
            url,
            user,
            password,
        } = account;

        if (typeof id !== 'string' || id.length > 64 || !ACCOUNT_ID.test(id)) {
            throw new InvalidAgentDefinitionError(`calendar account ${index}: id must match ${ACCOUNT_ID.source} (at most 64).`);
        }

        if (ids.has(id)) {
            throw new InvalidAgentDefinitionError(`calendar account ${index}: id "${id}" must be unique.`);
        }

        ids.add(id);

        if (!nonEmptyString(url) || !URL.canParse(url) || !['http:', 'https:'].includes(new URL(url).protocol)) {
            throw new InvalidAgentDefinitionError(`calendar account "${id}": url must be an http(s) URL.`);
        }

        if (!nonEmptyString(user)) {
            throw new InvalidAgentDefinitionError(`calendar account "${id}": user must be a non-empty string.`);
        }

        if (!nonEmptyString(password)) {
            throw new InvalidAgentDefinitionError(`calendar account "${id}": password must be a non-empty string.`);
        }

        return {
            id,
            url,
            user,
            password,
        };
    });
}

/** The client options checked, with their defaults (InvalidAgentDefinitionError). */
export function normalizeClientOptions(options: CalendarClientOptions): CalendarClientOptionsNormalized {
    if (!isObject(options)) {
        throw new InvalidAgentDefinitionError('calendar options must be an object.');
    }

    if (options.fetch !== undefined && typeof options.fetch !== 'function') {
        throw new InvalidAgentDefinitionError('calendar fetch must be a function.');
    }

    const clock = options.clock ?? systemClock;

    if (!isObject(clock) || typeof clock.now !== 'function' || typeof clock.setTimeout !== 'function') {
        throw new InvalidAgentDefinitionError('calendar clock must have now() and setTimeout().');
    }

    const timeoutMs = options.timeoutMs ?? CALENDAR_TIMEOUT_MS;

    if (typeof timeoutMs !== 'number' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TIMER_MAX_MS) {
        throw new InvalidAgentDefinitionError(`calendar timeoutMs must be an integer from 1 to ${TIMER_MAX_MS}.`);
    }

    const timezone = options.timezone ?? CALENDAR_DEFAULT_TIMEZONE;

    if (!isTimeZone(timezone)) {
        throw new InvalidAgentDefinitionError('calendar timezone must be an IANA time zone id.');
    }

    return {
        fetch: options.fetch ?? globalThis.fetch,
        clock,
        timeoutMs,
        timezone,
    };
}
