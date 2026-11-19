/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError, systemClock } from '@chamvi/core';
import { DEFAULT_HOOKS_PATH, OPENCLAW_CHANNEL_NAME, OPENCLAW_TIMEOUT_MS } from '../constants.ts';
import type { OpenclawChannelOptions, ResolvedOpenclawOptions } from '../types.ts';

function invalid(message: string): InvalidAgentDefinitionError {
    return new InvalidAgentDefinitionError(`openclawChannel: ${message}`);
}

function isNonEmpty(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function optionalNonEmpty(value: unknown, label: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!isNonEmpty(value)) {
        throw invalid(`${label} must be a non-empty string.`);
    }

    return value;
}

/** A value `fetch` sends as a header as is: Latin-1, no control character, no surrounding whitespace. */
function isHeaderSafe(value: string): boolean {
    // eslint-disable-next-line no-control-regex
    return !/[\x00-\x1F\x7F]|[^\x00-\xFF]/.test(value) && value.trim() === value;
}

function assertBaseUrl(value: unknown): string {
    if (!isNonEmpty(value)) {
        throw invalid('baseUrl must be an absolute http(s) URL.');
    }

    let url: URL;

    try {
        url = new URL(value);
    } catch {
        throw invalid('baseUrl must be an absolute http(s) URL.');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw invalid('baseUrl must be an absolute http(s) URL.');
    }

    if (url.username || url.password) {
        throw invalid('baseUrl must not carry credentials; pass hooksToken.');
    }

    if (url.search || url.hash || value.includes('?') || value.includes('#')) {
        throw invalid('baseUrl must not have a query or hash.');
    }

    return url.href;
}

/** `<baseUrl><hooksPath>/agent`, a base path of `baseUrl` kept. */
export function hookUrl(baseUrl: string, hooksPath: string): string {
    return `${baseUrl.replace(/\/+$/, '')}${hooksPath}/agent`;
}

export function resolveOptions(options: OpenclawChannelOptions): ResolvedOpenclawOptions {
    const name = options.name ?? OPENCLAW_CHANNEL_NAME;

    if (!isNonEmpty(name)) {
        throw invalid('name must be a non-empty string.');
    }

    if (!isNonEmpty(options.hooksToken)) {
        throw invalid('hooksToken must be a non-empty string.');
    }

    if (!isHeaderSafe(options.hooksToken)) {
        // fetch would refuse it on every send, with the token in its message
        throw invalid('hooksToken must not hold control characters, characters above U+00FF or surrounding whitespace.');
    }

    const baseUrl = assertBaseUrl(options.baseUrl);
    const rawHooksPath = options.hooksPath ?? DEFAULT_HOOKS_PATH;

    if (typeof rawHooksPath !== 'string' || !rawHooksPath.startsWith('/')) {
        throw invalid('hooksPath must start with "/" and must not be "/".');
    }

    // `/hooks/` would build `/hooks//agent`
    const hooksPath = rawHooksPath.replace(/\/+$/, '');

    if (hooksPath === '') {
        throw invalid('hooksPath must start with "/" and must not be "/".');
    }

    const agentId = optionalNonEmpty(options.agentId, 'agentId');
    const deliver = options.deliver as Partial<OpenclawChannelOptions['deliver']> | undefined;

    if (!isNonEmpty(deliver?.channel) || deliver.channel === 'last') {
        throw invalid('deliver.channel must name a channel ("last" is refused by OpenClaw hooks).');
    }

    if (!isNonEmpty(deliver.to)) {
        throw invalid('deliver.to must be a non-empty string.');
    }

    const accountId = optionalNonEmpty(deliver.accountId, 'deliver.accountId');

    if (options.approvalUrl !== undefined && typeof options.approvalUrl !== 'function') {
        throw invalid('approvalUrl must be a function.');
    }

    const timeoutMs = options.timeoutMs ?? OPENCLAW_TIMEOUT_MS;

    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
        throw invalid('timeoutMs must be a positive integer.');
    }

    return {
        name,
        url: hookUrl(baseUrl, hooksPath),
        hooksToken: options.hooksToken,
        ...(agentId === undefined ? {} : { agentId }),
        deliver: {
            channel: deliver.channel,
            to: deliver.to,
            ...(accountId === undefined ? {} : { accountId }),
        },
        ...(options.approvalUrl ? { approvalUrl: options.approvalUrl } : {}),
        timeoutMs,
        clock: options.clock ?? systemClock,
        fetch: options.fetch ?? globalThis.fetch,
    };
}
