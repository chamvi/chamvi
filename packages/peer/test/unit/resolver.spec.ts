/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { Invoker } from '@chamvi/store';
import { ControllableClock } from '@chamvi/test-kit';
import { PEER_POLL_DEFAULT_MS, createPeerResolver } from '@chamvi/peer';
import type { PeerOptions } from '@chamvi/peer';
import { createFakeFetch, json } from '../utils/fetch.ts';

const SECRET = 'outgoing-secret-0123456789';

function resolve(peers: Record<string, PeerOptions>) {
    return createPeerResolver({ peers, clock: new ControllableClock(0) });
}

function refusal(peers: Record<string, unknown>): Error {
    try {
        resolve(peers as Record<string, PeerOptions>);
    } catch (error) {
        return error as Error;
    }

    throw new Error('expected the options to be refused');
}

function invoker(fields: Partial<Invoker>): Invoker {
    return {
        id: 'x',
        kind: 'token',
        bindings: [],
        ...fields,
    };
}

describe('createPeerResolver: options', () => {
    it.each([
        ['a name outside the agent-name rule', { Dev: { url: 'https://dev.example', outgoing: { token: SECRET } } }],
        ['a non-http(s) url', { dev: { url: 'ftp://dev.example', outgoing: { token: SECRET } } }],
        ['an unparsable url', { dev: { url: 'not a url', outgoing: { token: SECRET } } }],
        ['a pollMs below 1 000', {
            dev: {
                url: 'https://dev.example', 
                outgoing: { token: SECRET }, 
                pollMs: 999, 
            }, 
        }],
        ['a fractional pollMs', {
            dev: {
                url: 'https://dev.example', 
                outgoing: { token: SECRET }, 
                pollMs: 1500.5, 
            }, 
        }],
        ['an empty outgoing token', { dev: { url: 'https://dev.example', outgoing: { token: '' } } }],
        ['an empty incoming token', {
            dev: {
                url: 'https://dev.example', 
                outgoing: { token: SECRET }, 
                incoming: { token: '' }, 
            }, 
        }],
        ['an empty incoming authup client', { dev: { url: 'https://dev.example', incoming: { authupClient: '' } } }],
        ['an unknown outgoing shape', { dev: { url: 'https://dev.example', outgoing: { password: SECRET } } }],
        ['an authup outgoing without a secret', {
            dev: {
                url: 'https://dev.example',
                outgoing: {
                    authup: {
                        url: 'https://auth.example',
                        clientId: 'c1',
                        clientSecret: '', 
                    }, 
                }, 
            }, 
        }],
        ['an authup outgoing on a non-http url', {
            dev: {
                url: 'https://dev.example',
                outgoing: {
                    authup: {
                        url: 'file:///x',
                        clientId: 'c1',
                        clientSecret: SECRET, 
                    }, 
                }, 
            }, 
        }],
        ['an approvals destination without an address', {
            dev: {
                url: 'https://dev.example',
                outgoing: { token: SECRET },
                approvals: { channel: 'chat', address: '' }, 
            }, 
        }],
        ['a non-boolean untrusted', {
            dev: {
                url: 'https://dev.example',
                outgoing: { token: SECRET },
                untrusted: 'yes', 
            }, 
        }],
        ['an outgoing with both shapes', {
            dev: {
                url: 'https://dev.example',
                outgoing: {
                    token: SECRET,
                    authup: {
                        url: 'https://auth.example',
                        clientId: 'c1',
                        clientSecret: SECRET,
                    },
                },
            },
        }],
        ['an incoming with both shapes', {
            dev: {
                url: 'https://dev.example',
                outgoing: { token: SECRET },
                incoming: { token: 'peer-dev', authupClient: 'c1' },
            },
        }],
        ['two peers recognized by one incoming token', {
            dev: { url: 'https://dev.example', incoming: { token: 'peer-a' } },
            ops: { url: 'https://ops.example', incoming: { token: 'peer-a' } },
        }],
    ])('refuses %s with an InvalidAgentDefinitionError that never names the secret', (_, peers) => {
        const error = refusal(peers);

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).not.toContain(SECRET);
    });

    it('reads the settings with their defaults', () => {
        const resolver = resolve({
            dev: { url: 'https://dev.example', outgoing: { token: SECRET } },
            ops: {
                url: 'http://ops.internal:3000/api/',
                incoming: { token: 'peer-ops' },
                pollMs: 5_000,
                untrusted: true,
                approvals: { channel: 'whatsapp', address: 'owner' },
            },
        });

        expect(resolver.has('dev')).toBe(true);
        expect(resolver.has('nope')).toBe(false);
        expect(resolver.settings('dev')).toEqual({
            pollMs: PEER_POLL_DEFAULT_MS,
            untrusted: false,
            outgoing: true,
        });
        expect(resolver.settings('ops')).toEqual({
            pollMs: 5_000,
            untrusted: true,
            outgoing: false,
            approvals: { channel: 'whatsapp', address: 'owner' },
        });
    });

    it('drops an empty query or fragment delimiter from the peer and authup urls', async () => {
        const fake = createFakeFetch((request) => (request.url.endsWith('/token') ?
            json({ access_token: 'access-1', expires_in: 3_600 }) :
            json({
                id: 'remote-1',
                status: 'running',
                tainted: false,
                usage: { inputTokens: 0, outputTokens: 0 },
            })));
        const resolver = createPeerResolver({
            peers: {
                dev: {
                    url: 'https://dev.example/api?',
                    outgoing: {
                        authup: {
                            url: 'https://auth.example/#',
                            clientId: 'chamvi-assistants',
                            clientSecret: SECRET,
                        },
                    },
                },
            },
            clock: new ControllableClock(new Date('2026-11-19T10:00:00Z')),
            fetch: fake.fetch,
        });

        await resolver.transport('dev').read('remote-1', { signal: new AbortController().signal });

        expect(fake.requests.map((r) => r.url)).toEqual([
            'https://auth.example/token',
            'https://dev.example/api/runs/remote-1',
        ]);
    });

    it('refuses settings and a transport for an unknown peer, and a transport without outgoing', () => {
        const resolver = resolve({ ops: { url: 'https://ops.example', incoming: { token: 'peer-ops' } } });

        expect(() => resolver.settings('dev')).toThrow(InvalidAgentDefinitionError);
        expect(() => resolver.transport('dev')).toThrow(InvalidAgentDefinitionError);
        expect(() => resolver.transport('ops')).toThrow(InvalidAgentDefinitionError);
    });

    it('passes the approval link through', () => {
        const resolver = createPeerResolver({
            peers: {},
            clock: new ControllableClock(0),
            approvalUrl: ({ runId, approvalId }) => `https://app.example/approvals?run=${runId}&approval=${approvalId}`,
        });

        expect(resolver.approvalUrl?.({ runId: 'r1', approvalId: 'a1' })).toBe('https://app.example/approvals?run=r1&approval=a1');
        expect(resolve({}).approvalUrl).toBeUndefined();
    });
});

describe('createPeerResolver: recognize', () => {
    const resolver = resolve({
        dev: { url: 'https://dev.example', incoming: { token: 'peer-dev' } },
        ops: { url: 'https://ops.example', incoming: { authupClient: 'c1' } },
    });

    it('recognizes the static token principal of a peer', () => {
        expect(resolver.recognize(invoker({ kind: 'token', id: 'peer-dev' }))).toBe('dev');
    });

    it('recognizes the authup client of a peer', () => {
        expect(resolver.recognize(invoker({
            kind: 'authup',
            id: 'c1',
            identity: { type: 'client', id: 'c1' },
        }))).toBe('ops');
    });

    it.each([
        ['no invoker', undefined],
        ['another token', invoker({ kind: 'token', id: 'peer-other' })],
        ['the token id under another kind', invoker({ kind: 'oidc', id: 'peer-dev' })],
        ['a user with the client id', invoker({
            kind: 'authup', 
            id: 'c1', 
            identity: { type: 'user', id: 'c1' }, 
        })],
        ['another client', invoker({
            kind: 'authup', 
            id: 'c2', 
            identity: { type: 'client', id: 'c2' }, 
        })],
        ['the client id as a token', invoker({ kind: 'token', id: 'c1' })],
        ['the client identity from another issuer', invoker({
            kind: 'oidc',
            id: 'c1',
            identity: { type: 'client', id: 'c1' },
        })],
    ])('recognizes nothing for %s', (_, value) => {
        expect(resolver.recognize(value)).toBeUndefined();
    });
});
