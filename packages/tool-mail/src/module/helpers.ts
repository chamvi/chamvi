/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { envJson } from '@chamvi/app';
import type { Env } from '@chamvi/app';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import type { MailAccount } from '../client/types.ts';
import { ACCOUNT_ID_PATTERN } from '../options/constants.ts';
import { normalizeAccount } from '../options/module.ts';
import { FILE_VARIABLE_SUFFIX, MAIL_ACCOUNTS_VARIABLE, MAIL_VARIABLE_PREFIX } from './constants.ts';

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

/** `CHAMVI_MAIL_<ID>_<field>`: the id upper-cased, `-` as `_`. */
function variableOf(id: string, field: string): string {
    return `${MAIL_VARIABLE_PREFIX}${id.toUpperCase().replaceAll('-', '_')}_${field}`;
}

/** One entry of `CHAMVI_MAIL_ACCOUNTS` as an account; its fields are checked by `normalizeAccount`. */
function accountOf(env: Env, entry: unknown, at: string, ids: Set<string>): MailAccount {
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

    const passwordVariable = variableOf(id, 'PASSWORD');
    const user = readSecretVariable(env, variableOf(id, 'USER')) ?? address;
    const password = readSecretVariable(env, passwordVariable);

    if (password === undefined) {
        return fail(`${passwordVariable} is required for ${at}.`);
    }

    const account: MailAccount = {
        id,
        host,
        user,
        password,
        address,
    };

    for (const field of ['port', 'security', 'folders', 'gmail'] as const) {
        if (entry[field] !== undefined) {
            Object.assign(account, { [field]: entry[field] });
        }
    }

    // the rest of the fields, named by the variable and index, never by a value
    normalizeAccount(account, at);

    return account;
}

/**
 * The accounts of `CHAMVI_MAIL_ACCOUNTS` (`[{ id?, address, host, port?,
 * security?, folders?, gmail? }]`) with their credentials from
 * `CHAMVI_MAIL_<ID>_USER` (default the address) and
 * `CHAMVI_MAIL_<ID>_PASSWORD` (required), each also from a `_FILE` variant;
 * undefined without the variable. The id defaults to the address with `@`
 * and `.` as `-`. Errors are InvalidAgentDefinitionErrors naming the
 * variable and index, never a value.
 */
export function readMailAccountsFromEnv(env: Env): MailAccount[] | undefined {
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
