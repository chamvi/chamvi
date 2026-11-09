/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { envJson, envSecret, envString } from '@chamvi/app';
import type { Env } from '@chamvi/app';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import type { CalendarAccount } from '../client/types.ts';
import { isTimeZone } from '../options/module.ts';
import {
    CALENDAR_ACCOUNTS_VARIABLE,
    CALENDAR_TIMEZONE_VARIABLE,
    CALENDAR_VARIABLE_PREFIX,
} from './constants.ts';
import type { CalendarEnvEntry } from './types.ts';

const ACCOUNT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Every message names the variable, never its value (it may be a secret).
function fail(message: string): never {
    throw new InvalidAgentDefinitionError(message);
}

/** `CHAMVI_CALENDAR_<ID>_<field>`: the id upper-cased, `-` as `_`. */
export function variableOf(id: string, field: string): string {
    return `${CALENDAR_VARIABLE_PREFIX}${id.toUpperCase().replaceAll('-', '_')}_${field}`;
}

/**
 * The entries of `CHAMVI_CALENDAR_ACCOUNTS` (`[{ id?, url, address? }]`)
 * with their credentials from `CHAMVI_CALENDAR_<ID>_USER` (default the
 * address) and `CHAMVI_CALENDAR_<ID>_PASSWORD` (required), each also from a
 * `_FILE` variant; undefined without the variable. The id defaults to the
 * address with `@` and `.` as `-`. Errors are InvalidAgentDefinitionErrors
 * naming the variable and index, never a value.
 */
export function readCalendarEnvEntries(env: Env): CalendarEnvEntry[] | undefined {
    const value = envJson(env, CALENDAR_ACCOUNTS_VARIABLE);

    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        return fail(`${CALENDAR_ACCOUNTS_VARIABLE} must be a JSON array of { id?, url, address? }.`);
    }

    const ids = new Set<string>();

    return value.map((entry: unknown, index): CalendarEnvEntry => {
        const at = `${CALENDAR_ACCOUNTS_VARIABLE}[${index}]`;

        if (!isObject(entry)) {
            return fail(`${at} must be an object.`);
        }

        const { url, address } = entry;

        if (address !== undefined && !(typeof address === 'string' && address.length > 0)) {
            return fail(`${at}.address must be a non-empty string.`);
        }

        let { id } = entry;

        if (id === undefined) {
            if (address === undefined) {
                return fail(`${at}.id is required without an address.`);
            }

            id = address.toLowerCase().replace(/[@.]/g, '-');
        }

        if (typeof id !== 'string' || id.length > 64 || !ACCOUNT_ID.test(id)) {
            return fail(`${at}.id must match ${ACCOUNT_ID.source} (at most 64).`);
        }

        // the credential variables of two ids must not collide
        const key = id.replaceAll('-', '_');

        if (ids.has(key)) {
            return fail(`${at}.id "${id}" must be unique.`);
        }

        ids.add(key);

        if (typeof url !== 'string' || !URL.canParse(url) || !['http:', 'https:'].includes(new URL(url).protocol)) {
            return fail(`${at}.url must be an http(s) URL.`);
        }

        const userVariable = variableOf(id, 'USER');
        const passwordVariable = variableOf(id, 'PASSWORD');
        const user = envSecret(env, userVariable) ?? address;

        if (user === undefined) {
            return fail(`${userVariable} is required for ${at} (it has no address).`);
        }

        const password = envSecret(env, passwordVariable);

        if (password === undefined) {
            return fail(`${passwordVariable} is required for ${at}.`);
        }

        return {
            account: {
                id,
                url,
                user,
                password,
            },
            ...(address !== undefined && { address }),
        };
    });
}

/** The accounts of `CHAMVI_CALENDAR_ACCOUNTS` (see `readCalendarEnvEntries`); undefined without the variable. */
export function readCalendarAccountsFromEnv(env: Env): CalendarAccount[] | undefined {
    return readCalendarEnvEntries(env)?.map((entry) => entry.account);
}

/** `CHAMVI_CALENDAR_TIMEZONE`: an IANA zone id or `UTC` (InvalidAgentDefinitionError); undefined when unset. */
export function readCalendarTimezoneFromEnv(env: Env): string | undefined {
    const value = envString(env, CALENDAR_TIMEZONE_VARIABLE);

    if (value !== undefined && !isTimeZone(value)) {
        return fail(`${CALENDAR_TIMEZONE_VARIABLE} must be an IANA time zone id (e.g. Europe/Berlin) or UTC.`);
    }

    return value;
}
