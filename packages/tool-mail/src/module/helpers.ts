/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { envJson, envSecret } from '@chamvi/app';
import type { Env } from '@chamvi/app';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import { ACCOUNT_ID_PATTERN } from '../options/constants.ts';
import { normalizeAccount } from '../options/module.ts';
import { MAIL_ACCOUNTS_VARIABLE, MAIL_VARIABLE_PREFIX } from './constants.ts';
import type { MailEnvAccount } from './types.ts';

// Every message names the variable, never its value (it may be a secret).
function fail(message: string): never {
    throw new InvalidAgentDefinitionError(message);
}

/** `CHAMVI_MAIL_<ID>_<field>`: the id upper-cased, `-` as `_`. */
export function variableOf(id: string, field: string): string {
    return `${MAIL_VARIABLE_PREFIX}${id.toUpperCase().replaceAll('-', '_')}_${field}`;
}

/** One entry of `CHAMVI_MAIL_ACCOUNTS` as an account; its fields are checked by `normalizeAccount`. */
function accountOf(env: Env, entry: unknown, at: string, ids: Set<string>): MailEnvAccount {
    if (!isObject(entry)) {
        return fail(`${at} must be an object.`);
    }

    const { address, host } = entry;

    if (typeof address !== 'string' || address.length === 0) {
        return fail(`${at}.address must be a non-empty string.`);
    }

    const id = entry.id ?? address.toLowerCase().replace(/[@.]/g, '-');

    if (typeof id !== 'string' || id.length > 64 || !ACCOUNT_ID_PATTERN.test(id)) {
        return fail(`${at}.id must match ${ACCOUNT_ID_PATTERN.source} (at most 64).`);
    }

    // the credential variables of two ids must not collide
    const key = id.replaceAll('-', '_');

    if (ids.has(key)) {
        return fail(`${at}.id "${id}" must be unique.`);
    }

    ids.add(key);

    if (typeof host !== 'string' || host.length === 0) {
        return fail(`${at}.host must be a non-empty string.`);
    }

    const user = envSecret(env, variableOf(id, 'USER')) ?? address;
    const password = envSecret(env, variableOf(id, 'PASSWORD'));
    const account: MailEnvAccount = {
        id,
        host,
        user,
        address,
        ...(password !== undefined && { password }),
    };

    for (const field of ['port', 'security', 'folders', 'gmail'] as const) {
        if (entry[field] !== undefined) {
            Object.assign(account, { [field]: entry[field] });
        }
    }

    // the rest of the fields, named by the variable and index, never by a value
    // a missing password is no format error: the store may hold it, `setup` decides
    normalizeAccount({ ...account, password: password ?? 'unset' }, at);

    return account;
}

/**
 * The accounts of `CHAMVI_MAIL_ACCOUNTS` (`[{ id?, address, host, port?,
 * security?, folders?, gmail? }]`) with their credentials from
 * `CHAMVI_MAIL_<ID>_USER` (default the address) and
 * `CHAMVI_MAIL_<ID>_PASSWORD`, each also from a `_FILE` variant; undefined
 * without the variable. A password in neither env nor store fails in `setup`.
 * The id defaults to the address with `@`
 * and `.` as `-`. Errors are InvalidAgentDefinitionErrors naming the
 * variable and index, never a value.
 */
export function readMailAccountsFromEnv(env: Env): MailEnvAccount[] | undefined {
    const value = envJson(env, MAIL_ACCOUNTS_VARIABLE);

    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        return fail(`${MAIL_ACCOUNTS_VARIABLE} must be a JSON array of { id?, address, host, port?, security?, folders?, gmail? }.`);
    }

    const ids = new Set<string>();

    return value.map((entry: unknown, index) => accountOf(env, entry, `${MAIL_ACCOUNTS_VARIABLE}[${index}]`, ids));
}
