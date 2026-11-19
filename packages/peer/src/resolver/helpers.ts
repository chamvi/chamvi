/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError, isAgentName } from '@chamvi/core';
import { isObject } from 'smob';
import type { PeerOutgoing } from '../auth/types.ts';
import { PEER_POLL_DEFAULT_MS, PEER_POLL_MIN_MS } from './constants.ts';
import type { PeerEntry, PeerIncoming } from './types.ts';

function refuse(name: string, message: string): InvalidAgentDefinitionError {
    // only the peer's name and the field: never a value, which may be a secret
    return new InvalidAgentDefinitionError(`Peer "${name}": ${message}`);
}

function isFilled(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

/** An http(s) URL without credentials, query or fragment, its trailing slashes cut; undefined for anything else. */
function httpUrl(value: unknown): string | undefined {
    if (typeof value !== 'string' || !URL.canParse(value)) {
        return undefined;
    }

    const url = new URL(value);

    if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.username !== '' ||
        url.password !== '' ||
        url.search !== '' ||
        url.hash !== ''
    ) {
        return undefined;
    }

    // an empty `?` or `#` passes the checks above but stays in href
    url.search = '';
    url.hash = '';

    return url.href.replace(/\/+$/, '');
}

function readOutgoing(name: string, value: unknown): PeerOutgoing | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (isObject(value) && 'token' in value && 'authup' in value) {
        throw refuse(name, 'outgoing must be either { token } or { authup }, not both.');
    }

    if (isObject(value) && 'token' in value) {
        if (!isFilled(value.token)) {
            throw refuse(name, 'outgoing.token must be a non-empty string.');
        }

        return { token: value.token };
    }

    if (isObject(value) && isObject(value.authup)) {
        const { authup } = value;
        const url = httpUrl(authup.url);

        if (!url) {
            throw refuse(name, 'outgoing.authup.url must be an http(s) URL.');
        }

        if (!isFilled(authup.clientId) || !isFilled(authup.clientSecret)) {
            throw refuse(name, 'outgoing.authup needs a non-empty clientId and clientSecret.');
        }

        return {
            authup: {
                url,
                clientId: authup.clientId,
                clientSecret: authup.clientSecret,
            },
        };
    }

    throw refuse(name, 'outgoing must be { token } or { authup: { url, clientId, clientSecret } }.');
}

function readIncoming(name: string, value: unknown): PeerIncoming | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (isObject(value) && 'token' in value && 'authupClient' in value) {
        throw refuse(name, 'incoming must be either { token } or { authupClient }, not both.');
    }

    if (isObject(value) && 'token' in value) {
        if (!isFilled(value.token)) {
            throw refuse(name, 'incoming.token must be the non-empty id of a static token principal.');
        }

        return { token: value.token };
    }

    if (isObject(value) && 'authupClient' in value) {
        if (!isFilled(value.authupClient)) {
            throw refuse(name, 'incoming.authupClient must be a non-empty authup client id.');
        }

        return { authupClient: value.authupClient };
    }

    throw refuse(name, 'incoming must be { token } or { authupClient }.');
}

/** The validated options of peer `name`; an InvalidAgentDefinitionError that never names a value. */
export function readPeer(name: string, options: unknown): PeerEntry {
    if (!isAgentName(name)) {
        throw new InvalidAgentDefinitionError('A peer name must match ^[a-z0-9]+(-[a-z0-9]+)*$ (at most 64 characters).');
    }

    if (!isObject(options)) {
        throw refuse(name, 'the options must be an object.');
    }

    const url = httpUrl(options.url);

    if (!url) {
        throw refuse(name, 'url must be an http(s) URL without credentials, query or fragment.');
    }

    const outgoing = readOutgoing(name, options.outgoing);
    const incoming = readIncoming(name, options.incoming);

    const {
        pollMs = PEER_POLL_DEFAULT_MS, 
        untrusted = false, 
        approvals, 
    } = options;

    if (typeof pollMs !== 'number' || !Number.isSafeInteger(pollMs) || pollMs < PEER_POLL_MIN_MS) {
        throw refuse(name, `pollMs must be an integer of at least ${PEER_POLL_MIN_MS}.`);
    }

    if (typeof untrusted !== 'boolean') {
        throw refuse(name, 'untrusted must be a boolean.');
    }

    if (approvals !== undefined && (!isObject(approvals) || !isFilled(approvals.channel) || !isFilled(approvals.address))) {
        throw refuse(name, 'approvals must be { channel, address } with non-empty strings.');
    }

    return {
        name,
        url,
        ...(outgoing ? { outgoing } : {}),
        ...(incoming ? { incoming } : {}),
        settings: {
            pollMs,
            untrusted,
            outgoing: outgoing !== undefined,
            ...(approvals ? { approvals: { channel: approvals.channel as string, address: approvals.address as string } } : {}),
        },
    };
}

/** The key two peers must not share: what recognizes a peer's calls. */
export function incomingKey(incoming: PeerIncoming): string {
    return 'token' in incoming ? `token:${incoming.token}` : `authup:${incoming.authupClient}`;
}
