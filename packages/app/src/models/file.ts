/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import { envString } from '../env/module.ts';
import type { Env } from '../env/types.ts';
import { assertPackageSpecifier, assertUniqueSpecifiers } from '../package/helpers.ts';
import {
    CONFIG_FILE_VARIABLE,
    DEFAULT_CONFIG_FILE,
    PROVIDER_TYPES,
    SECRET_HEADER_PATTERN,
} from './constants.ts';
import {
    assertBaseUrl,
    assertHeaderName,
    isProviderName,
    isProviderType,
} from './helpers.ts';
import type { ProviderConfig, SecretValue } from './types.ts';

const FILE_KEYS = ['model', 'providers', 'agents', 'remotes'];
const PROVIDER_KEYS = ['type', 'apiKey', 'baseURL', 'headers'];

type ConfigFile = {
    model?: string; 
    providers: Record<string, ProviderConfig>; 
    agents?: string[] 
};

function fail(message: string): never {
    throw new InvalidAgentDefinitionError(message);
}

function readSecretValue(value: unknown, field: string, literal: boolean): SecretValue {
    if (typeof value === 'string') {
        if (!literal) {
            fail(`${field} must be { "env": "<VAR>" } or { "file": "<path>" }, not a literal.`);
        }

        return value;
    }

    if (isObject(value) && Object.keys(value).length === 1) {
        if (typeof value.env === 'string' && value.env.length > 0) {
            return { env: value.env };
        }

        if (typeof value.file === 'string' && value.file.length > 0) {
            return { file: value.file };
        }
    }

    return fail(`${field} must be ${literal ? 'a string, ' : ''}{ "env": "<VAR>" } or { "file": "<path>" }.`);
}

function readProvider(value: unknown, field: string): ProviderConfig {
    if (!isObject(value)) {
        fail(`${field} must be an object.`);
    }

    for (const key of Object.keys(value)) {
        if (!PROVIDER_KEYS.includes(key)) {
            fail(`${field}.${key} is no provider field (${PROVIDER_KEYS.join(', ')}).`);
        }
    }

    if (!isProviderType(value.type)) {
        fail(`${field}.type must be one of ${Object.keys(PROVIDER_TYPES).join(', ')}.`);
    }

    const provider: ProviderConfig = { type: value.type };

    if (typeof value.apiKey !== 'undefined') {
        provider.apiKey = readSecretValue(value.apiKey, `${field}.apiKey`, false);
    }

    if (typeof value.baseURL !== 'undefined') {
        if (typeof value.baseURL !== 'string') {
            fail(`${field}.baseURL must be a string.`);
        }

        provider.baseURL = assertBaseUrl(value.baseURL, `${field}.baseURL`);
    }

    if (typeof value.headers !== 'undefined') {
        if (!isObject(value.headers)) {
            fail(`${field}.headers must be an object.`);
        }

        const headers: Record<string, SecretValue> = {};

        for (const [name, header] of Object.entries(value.headers)) {
            const headerField = `${field}.headers.${name}`;
            const lower = assertHeaderName(name, headerField);

            if (Object.hasOwn(headers, lower)) {
                fail(`${headerField} repeats a header name (header names are case-insensitive).`);
            }

            headers[lower] = readSecretValue(header, headerField, !SECRET_HEADER_PATTERN.test(name));
        }

        provider.headers = headers;
    }

    return provider;
}

/**
 * The config file a lifecycle reads: `CHAMVI_CONFIG_FILE` (relative to `cwd`,
 * `named`), else `./chamvi.json` when it exists, else undefined.
 */
export async function locateConfigFile(env: Env, cwd: string): Promise<{ path: string; named: boolean } | undefined> {
    const named = envString(env, CONFIG_FILE_VARIABLE);
    const path = resolve(cwd, named ?? DEFAULT_CONFIG_FILE);

    if (named === undefined) {
        try {
            await stat(path);
        } catch {
            return undefined;
        }
    }

    return { path, named: named !== undefined };
}

/** The config file's agent package specifiers (`agents`), or none without a file; throws what readConfigFile throws. */
export async function readConfigFileAgents(env: Env, cwd: string): Promise<string[]> {
    const located = await locateConfigFile(env, cwd);

    return located ? (await readConfigFile(located.path)).agents ?? [] : [];
}

/**
 * The settings of a JSON config file (`chamvi.json`): `model`, `providers`
 * (shape checked, literal `apiKey` and credential headers refused), `agents`
 * (bare package specifiers), `remotes` ignored. Throws InvalidAgentDefinitionError on the first problem, naming the
 * file and field, never a value.
 */
export async function readConfigFile(path: string): Promise<ConfigFile> {
    const label = basename(path);
    let text: string;

    try {
        text = await readFile(path, 'utf8');
    } catch {
        return fail(`The config file ${path} cannot be read.`);
    }

    let data: unknown;

    try {
        data = JSON.parse(text);
    } catch {
        return fail(`${label}: the file ${path} is no valid JSON.`);
    }

    if (!isObject(data)) {
        fail(`${label}: the file ${path} must hold a JSON object.`);
    }

    for (const key of Object.keys(data)) {
        if (!FILE_KEYS.includes(key)) {
            fail(`${label}: ${key} is no config field (${FILE_KEYS.join(', ')}).`);
        }
    }

    const config: ConfigFile = { providers: {} };

    if (typeof data.model !== 'undefined') {
        if (typeof data.model !== 'string' || data.model.length === 0) {
            fail(`${label}: model must be a non-empty string.`);
        }

        config.model = data.model;
    }

    if (typeof data.providers !== 'undefined') {
        if (!isObject(data.providers)) {
            fail(`${label}: providers must be an object.`);
        }

        for (const [name, provider] of Object.entries(data.providers)) {
            const field = `${label}: providers.${name}`;

            if (!isProviderName(name)) {
                fail(`${field} is no provider name (must match ^[a-z0-9]+(-[a-z0-9]+)*$, at most 64 characters).`);
            }

            config.providers[name] = readProvider(provider, field);
        }
    }

    if (typeof data.agents !== 'undefined') {
        if (!Array.isArray(data.agents)) {
            fail(`${label}: agents must be an array of package names.`);
        }

        const agents = data.agents.map((entry: unknown, index: number) => assertPackageSpecifier(entry, `${label}: agents[${index}]`));

        assertUniqueSpecifiers(agents, `${label}: agents`);
        config.agents = agents;
    }

    return config;
}
