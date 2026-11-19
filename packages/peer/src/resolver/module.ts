/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import type {
    IPeerResolver,
    IPeerTransport,
    PeerSettings,
} from '@chamvi/core';
import { isObject } from 'smob';
import { createPeerCredential } from '../auth/module.ts';
import { PeerTransport } from '../transport/module.ts';
import { incomingKey, readPeer } from './helpers.ts';
import type { PeerEntry, PeerResolverOptions } from './types.ts';

/**
 * The configured peers: their settings, a transport per peer with
 * `outgoing`, and the recognition of a peer's calls from the invoker (a
 * static token principal's id, or an authup client's identity). Every option
 * is checked here: an InvalidAgentDefinitionError that never names a secret.
 */
export function createPeerResolver(options: PeerResolverOptions): IPeerResolver {
    if (!isObject(options.peers)) {
        throw new InvalidAgentDefinitionError('peers must be an object of peer options by name.');
    }

    const fetchFn: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
    const entries = new Map<string, { entry: PeerEntry; transport?: IPeerTransport }>();
    const recognized = new Map<string, string>();

    for (const [name, value] of Object.entries(options.peers)) {
        const entry = readPeer(name, value);

        if (entry.incoming) {
            const key = incomingKey(entry.incoming);
            const other = recognized.get(key);

            if (other !== undefined) {
                throw new InvalidAgentDefinitionError(`Peers "${other}" and "${name}" are recognized by the same incoming credential.`);
            }

            recognized.set(key, name);
        }

        entries.set(name, {
            entry,
            ...(entry.outgoing ? {
                transport: new PeerTransport({
                    name,
                    url: entry.url,
                    credential: createPeerCredential(entry.outgoing, {
                        peer: name, 
                        clock: options.clock, 
                        fetch: fetchFn, 
                    }),
                    clock: options.clock,
                    fetch: fetchFn,
                }),
            } : {}),
        });
    }

    const find = (name: string) => {
        const found = entries.get(name);

        if (!found) {
            throw new InvalidAgentDefinitionError(`Peer "${name}" is not configured.`);
        }

        return found;
    };

    return {
        has: (name) => entries.has(name),
        settings(name): PeerSettings {
            const { settings } = find(name).entry;

            return { ...settings, ...(settings.approvals ? { approvals: { ...settings.approvals } } : {}) };
        },
        transport(name) {
            const { transport } = find(name);

            if (!transport) {
                throw new InvalidAgentDefinitionError(`Peer "${name}" has no outgoing credential: this app cannot call it.`);
            }

            return transport;
        },
        recognize(invoker) {
            if (!invoker) {
                return undefined;
            }

            if (invoker.kind === 'token') {
                return recognized.get(`token:${invoker.id}`);
            }

            // only the kind @chamvi/http's authup() authenticator sets: another issuer's client never matches
            if (invoker.kind === 'authup' && invoker.identity?.type === 'client') {
                return recognized.get(`authup:${invoker.identity.id}`);
            }

            return undefined;
        },
        ...(options.approvalUrl ? { approvalUrl: options.approvalUrl } : {}),
    };
}
