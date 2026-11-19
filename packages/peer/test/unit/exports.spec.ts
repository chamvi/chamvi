/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import * as peer from '@chamvi/peer';
import * as module from '@chamvi/peer/module';
import type {
    PeerAuthupOutgoing,
    PeerIncoming,
    PeerOptions,
    PeerOutgoing,
    PeerResolverOptions,
    PeerTokenOutgoing,
} from '@chamvi/peer';
import type { PeerModuleOptions } from '@chamvi/peer/module';

describe('public api', () => {
    it('exports exactly the resolver, the request error and the constants', () => {
        expect(Object.keys(peer).sort()).toEqual([
            'PEER_POLL_DEFAULT_MS',
            'PEER_POLL_MIN_MS',
            'PEER_REQUEST_ERROR_CODE',
            'PEER_TOKEN_REFRESH_MARGIN_MS',
            'PeerRequestError',
            'createPeerResolver',
        ]);
    });

    it('keeps the transport and the credential internal', () => {
        expect(peer).not.toHaveProperty('PeerTransport');
        expect(peer).not.toHaveProperty('createPeerCredential');
    });

    it('exports the option types and no internal type', () => {
        expectTypeOf<PeerOptions['outgoing']>().toEqualTypeOf<PeerOutgoing | undefined>();
        expectTypeOf<PeerOutgoing>().toEqualTypeOf<PeerTokenOutgoing | PeerAuthupOutgoing>();
        expectTypeOf<PeerOptions['incoming']>().toEqualTypeOf<PeerIncoming | undefined>();
        expectTypeOf<PeerResolverOptions['peers']>().toEqualTypeOf<Record<string, PeerOptions>>();
        // @ts-expect-error internal: the credential of a transport
        expectTypeOf<peer.IPeerCredential>().not.toBeAny();
        // @ts-expect-error internal: what a credential needs
        expectTypeOf<peer.PeerCredentialContext>().not.toBeAny();
        // @ts-expect-error internal: the validated options
        expectTypeOf<peer.PeerEntry>().not.toBeAny();
    });
});

describe('@chamvi/peer/module', () => {
    it('exports exactly peerModule and PeerModule', () => {
        expect(Object.keys(module).sort()).toEqual(['PeerModule', 'peerModule']);
    });

    it('keeps the module name internal', () => {
        expect(module).not.toHaveProperty('PEER_MODULE_NAME');
    });

    it('exports the module options type', () => {
        expectTypeOf<PeerModuleOptions['peers']>().toEqualTypeOf<Record<string, PeerOptions>>();
    });
});
