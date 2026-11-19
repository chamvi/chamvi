/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { DEFAULT_GITHUB_API_URL } from '../constants.ts';

/** The webhook secrets as a non-empty list of non-empty strings. */
export function normalizeSecrets(input: string | readonly string[]): string[] {
    const secrets = typeof input === 'string' ? [input] : [...input];

    const hasInvalidSecret = secrets.length !== 0 &&
        secrets.some((secret) => typeof secret !== 'string' || secret.length === 0);

    if (secrets.length === 0 || hasInvalidSecret) {
        throw new InvalidAgentDefinitionError('webhookSecret must be a non-empty string or a non-empty list of them.');
    }

    return secrets;
}

/** The App id as a non-empty string. */
export function normalizeAppId(input: string | number): string {
    const appId = String(input).trim();

    if (appId.length === 0) {
        throw new InvalidAgentDefinitionError('appId must not be empty.');
    }

    return appId;
}

/** A positive integer installation id or `undefined`. */
export function normalizeInstallationId(input: number | undefined): number | undefined {
    if (input === undefined) {
        return undefined;
    }

    if (!Number.isSafeInteger(input) || input < 1) {
        throw new InvalidAgentDefinitionError(`installationId must be a positive integer, got ${input}.`);
    }

    return input;
}

/** GitHub App slugs: the App name lower-cased, runs of other characters as `-`. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The App slug as GitHub spells it in the bot login (`<slug>[bot]`), or
 * `undefined`. A miscased or malformed slug would never equal the sender's
 * login and silently disable the self-sender guard, so it is refused.
 */
export function normalizeSlug(input: string | undefined): string | undefined {
    if (input === undefined) {
        return undefined;
    }

    if (typeof input !== 'string' || !SLUG_PATTERN.test(input)) {
        throw new InvalidAgentDefinitionError(`slug must be the App's slug as in its URL (lower case letters, digits and "-"), got ${JSON.stringify(input)}.`);
    }

    return input;
}

/**
 * The REST API root without trailing slashes: an absolute https URL
 * without query or hash (plain http would send the App JWT and installation
 * tokens in cleartext), else InvalidAgentDefinitionError. Absent or empty
 * is GitHub's API (`DEFAULT_GITHUB_API_URL`), as Octokit treats it.
 */
export function normalizeBaseUrl(input: string | undefined): string {
    if (input === undefined || input === '') {
        return DEFAULT_GITHUB_API_URL;
    }

    let url: URL | undefined;

    try {
        url = new URL(input);
    } catch {
        url = undefined;
    }

    if (!url || url.protocol !== 'https:' || url.search !== '' || url.hash !== '' || input.includes('?') || input.includes('#')) {
        throw new InvalidAgentDefinitionError(`baseUrl must be an absolute https URL without query, e.g. https://ghe.example.com/api/v3, got ${JSON.stringify(input)}.`);
    }

    return input.replace(/\/+$/, '');
}
