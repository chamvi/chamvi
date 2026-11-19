/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { InvalidAgentDefinitionError, systemClock } from '@chamvi/core';
import { isPositiveInteger } from '../../subscription/helpers.ts';
import {
    CHANNEL_NAME_PATTERN,
    DEFAULT_BODY_LIMIT,
    GITHUB_CHANNEL_NAME,
    GITHUB_CHANNEL_TIMEOUT_MS,
    LOGIN_PATTERN,
} from '../constants.ts';
import type { GithubChannelOptions, ResolvedGithubChannelOptions } from '../types.ts';

const LOGIN = new RegExp(LOGIN_PATTERN);

function invalid(message: string): InvalidAgentDefinitionError {
    return new InvalidAgentDefinitionError(`githubChannel: ${message}`);
}

export function resolveOptions(options: GithubChannelOptions): ResolvedGithubChannelOptions {
    const { app } = options ?? {};

    if (!isObject(app) || typeof app.octokit !== 'function' || typeof app.botLogin !== 'function') {
        throw invalid('app must be the IGithubApp of createGithubApp().');
    }

    const name = options.name ?? GITHUB_CHANNEL_NAME;

    if (typeof name !== 'string' || !CHANNEL_NAME_PATTERN.test(name) || name.length > 64) {
        throw invalid(`name must match ${CHANNEL_NAME_PATTERN} and have at most 64 characters.`);
    }

    const mention = options.mention ?? [];
    const mentions = typeof mention === 'string' ? [mention] : [...mention];

    for (const login of mentions) {
        if (typeof login !== 'string' || !LOGIN.test(login)) {
            throw invalid(`mention must hold GitHub logins without "@", got ${JSON.stringify(login)}.`);
        }
    }

    if (options.approvalUrl !== undefined && typeof options.approvalUrl !== 'function') {
        throw invalid('approvalUrl must be a function.');
    }

    if (options.onError !== undefined && typeof options.onError !== 'function') {
        throw invalid('onError must be a function.');
    }

    if (!isObject(options.locks) || typeof options.locks.acquire !== 'function' || typeof options.locks.release !== 'function') {
        throw invalid('locks must be an ILockService (engine.lockService).');
    }

    const timeoutMs = options.timeoutMs ?? GITHUB_CHANNEL_TIMEOUT_MS;

    if (!isPositiveInteger(timeoutMs)) {
        throw invalid('timeoutMs must be a positive integer.');
    }

    const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;

    if (!isPositiveInteger(bodyLimit)) {
        throw invalid('bodyLimit must be a positive integer.');
    }

    return {
        app,
        name,
        locks: options.locks,
        mentions,
        ...(options.approvalUrl ? { approvalUrl: options.approvalUrl } : {}),
        timeoutMs,
        bodyLimit,
        // eslint-disable-next-line no-console
        onError: options.onError ?? ((error) => console.error('[chamvi]', error)),
        clock: options.clock ?? systemClock,
    };
}
