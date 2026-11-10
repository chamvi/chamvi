/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import {
    envInteger,
    envSecret,
    envString,
    envUrl,
} from '@chamvi/app';
import type { Env } from '@chamvi/app';
import {
    normalizeAppId,
    normalizeBaseUrl,
    normalizeInstallationId,
    normalizeSecrets,
    normalizeSlug,
} from '../app/helpers.ts';
import type { GithubAppOptions } from '../app/types.ts';
import { normalizePrivateKey } from '../auth/helpers.ts';
import { GITHUB_CONNECTION_TYPE } from './constants.ts';
import type { GithubEnvOption } from './types.ts';

/** The variable suffix of each createGithubApp option. */
const SUFFIXES = {
    appId: 'APP_ID',
    privateKey: 'APP_PRIVATE_KEY',
    webhookSecret: 'WEBHOOK_SECRET',
    installationId: 'INSTALLATION_ID',
    slug: 'APP_SLUG',
    baseUrl: 'API_URL',
} as const satisfies Record<GithubEnvOption, string>;

/**
 * The env variable of `key`: the default instance keeps `GITHUB_*`, a named
 * one `CHAMVI_GITHUB_<NAME>_*` (upper-cased, `-` as `_`).
 */
export function variableOf(name: string, key: GithubEnvOption): string {
    return name === GITHUB_CONNECTION_TYPE ?
        `GITHUB_${SUFFIXES[key]}` :
        `CHAMVI_GITHUB_${name.toUpperCase().replaceAll('-', '_')}_${SUFFIXES[key]}`;
}

/** Comma-separated webhook secrets (several during a rotation). */
export function splitSecrets(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map(String);
    }

    return String(value).split(',').map((item) => item.trim()).filter((item) => item.length > 0);
}

/** Refused by a normalizer: names the variable and drops the `got "<value>"` tail, so a value is never echoed. */
function guardVariable(variable: string, option: string, check: () => void): void {
    try {
        check();
    } catch (error) {
        if (error instanceof InvalidAgentDefinitionError && error.message.startsWith(`${option} `)) {
            throw new InvalidAgentDefinitionError(`${variable}${withoutValue(error.message.slice(option.length))}`);
        }

        throw error;
    }
}

/** A normalizer's message without its `, got "<value>"` tail. */
export function withoutValue(message: string): string {
    return message.replace(/, got [\s\S]*$/, '.');
}

/**
 * The createGithubApp options over env (C4), explicit options winning; each
 * set variable is checked now (a malformed one names the variable, never the
 * value), a missing one is decided in `setup`, where the store is readable.
 */
export function readGithubOptions(env: Env, name: string, options: Partial<GithubAppOptions>): Partial<GithubAppOptions> {
    const merged: Partial<GithubAppOptions> = { ...options };
    const variable = (key: GithubEnvOption) => variableOf(name, key);
    const take = <K extends GithubEnvOption>(key: K, read: () => GithubAppOptions[K] | undefined, check: (value: never) => unknown): void => {
        if (options[key] !== undefined) {
            return;
        }

        const value = read();

        if (value === undefined) {
            return;
        }

        guardVariable(variable(key), key, () => check(value as never));
        merged[key] = value;
    };

    take('appId', () => envSecret(env, variable('appId')), normalizeAppId);
    take('privateKey', () => envSecret(env, variable('privateKey')), normalizePrivateKey);
    take('webhookSecret', () => {
        const value = envSecret(env, variable('webhookSecret'));

        return value === undefined ? undefined : splitSecrets(value);
    }, normalizeSecrets);
    take('installationId', () => envInteger(env, variable('installationId'), { min: 1 }), normalizeInstallationId);
    take('slug', () => envString(env, variable('slug')), normalizeSlug);
    take('baseUrl', () => envUrl(env, variable('baseUrl'), { protocols: ['https:'] }), normalizeBaseUrl);

    return merged;
}

/** Whether the options can build an App without the store. */
export function isComplete(options: Partial<GithubAppOptions>): options is GithubAppOptions {
    return options.appId !== undefined && options.privateKey !== undefined && options.webhookSecret !== undefined;
}
