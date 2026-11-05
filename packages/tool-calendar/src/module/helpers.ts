/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { envJson, envString } from '@chamvi/app';
import type { Env } from '@chamvi/app';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import type { CalendarAccount } from '../client/types.ts';
import { isTimeZone } from '../options/module.ts';
import {
    CALENDAR_ACCOUNTS_VARIABLE,
    CALENDAR_TIMEZONE_VARIABLE,
    CALENDAR_VARIABLE_PREFIX,
    FILE_VARIABLE_SUFFIX,
} from './constants.ts';

const ACCOUNT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Every message names the variable, never its value (it may be a secret).
function fail(message: string): never {
    throw new InvalidAgentDefinitionError(message);
}

function isSet(value: string | undefined): value is string {
    return typeof value === 'string' && value.length > 0;
}

/**
 * The value of `name`, or of the file `<name>_FILE` names (one trailing
 * newline trimmed); undefined when neither is set. Both set, an unreadable
 * file or an empty one is an InvalidAgentDefinitionError naming the variable.
 */
export function readSecretVariable(env: Env, name: string): string | undefined {
    const fileName = `${name}${FILE_VARIABLE_SUFFIX}`;
    const value = env[name];
    const file = env[fileName];

    if (isSet(value) && isSet(file)) {
        return fail(`${name} and ${fileName} are both set: set one of them.`);
    }

    if (isSet(value)) {
        return value;
    }

    if (!isSet(file)) {
        return undefined;
    }

    let content: string;

    try {
        content = readFileSync(file, 'utf8');
    } catch {
        return fail(`${fileName}: the file cannot be read.`);
    }

    content = content.replace(/\r?\n$/, '');

    if (content.length === 0) {
        return fail(`${fileName}: the file is empty.`);
    }

    return content;
}

/** `CHAMVI_CALENDAR_<ID>_<field>`: the id upper-cased, `-` as `_`. */
function variableOf(id: string, field: string): string {
    return `${CALENDAR_VARIABLE_PREFIX}${id.toUpperCase().replaceAll('-', '_')}_${field}`;
}

/**
 * The accounts of `CHAMVI_CALENDAR_ACCOUNTS` (`[{ id?, url, address? }]`)
 * with their credentials from `CHAMVI_CALENDAR_<ID>_USER` (default the
 * address) and `CHAMVI_CALENDAR_<ID>_PASSWORD` (required), each also from a
 * `_FILE` variant; undefined without the variable. The id defaults to the
 * address with `@` and `.` as `-`. Errors are InvalidAgentDefinitionErrors
 * naming the variable and index, never a value.
 */
export function readCalendarAccountsFromEnv(env: Env): CalendarAccount[] | undefined {
    const value = envJson(env, CALENDAR_ACCOUNTS_VARIABLE);

    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        return fail(`${CALENDAR_ACCOUNTS_VARIABLE} must be a JSON array of { id?, url, address? }.`);
    }

    const ids = new Set<string>();

    return value.map((entry: unknown, index): CalendarAccount => {
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
        const user = readSecretVariable(env, userVariable) ?? address;

        if (user === undefined) {
            return fail(`${userVariable} is required for ${at} (it has no address).`);
        }

        const password = readSecretVariable(env, passwordVariable);

        if (password === undefined) {
            return fail(`${passwordVariable} is required for ${at}.`);
        }

        return {
            id,
            url,
            user,
            password,
        };
    });
}

/** `CHAMVI_CALENDAR_TIMEZONE`: an IANA zone id or `UTC` (InvalidAgentDefinitionError); undefined when unset. */
export function readCalendarTimezoneFromEnv(env: Env): string | undefined {
    const value = envString(env, CALENDAR_TIMEZONE_VARIABLE);

    if (value !== undefined && !isTimeZone(value)) {
        return fail(`${CALENDAR_TIMEZONE_VARIABLE} must be an IANA time zone id (e.g. Europe/Berlin) or UTC.`);
    }

    return value;
}
