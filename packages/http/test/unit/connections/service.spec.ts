/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { Permission } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';
import { createMemoryStore } from '@chamvi/core';
import type { ConnectionStatus, IConnectionHandle } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import type { Principal } from '@chamvi/http';
import { ConnectionService } from '../../../src/connections/service/index.ts';
import { flush, restricted } from '../../utils/app.ts';

const QR = '2@SECRET-QR-REFERENCE';

function principalOf(...grants: Array<string | PermissionBinding>): Principal {
    return {
        id: 'p',
        kind: 'token',
        bindings: grants.map((grant) => (typeof grant === 'string' ? { permission: { name: grant } } : grant)),
    };
}

function handleOf(name: string, options: { status?: ConnectionStatus; reset?: () => Promise<void> } = {}): IConnectionHandle {
    return {
        name,
        type: 'whatsapp',
        status: () => options.status ?? 'pairing',
        widgets: () => [{ kind: 'qr', value: QR }],
        subscribe: () => () => undefined,
        actions: options.reset ? { reset: options.reset } : {},
    };
}

function setup(handles: IConnectionHandle[]) {
    const clock = new ControllableClock(new Date(1_000_000));
    const onError = vi.fn();
    const service = new ConnectionService({
        connections: () => handles,
        connectionTypes: () => [],
        store: createMemoryStore({ clock }),
        clock,
        onError,
    });

    return { service, onError };
}

const nobody = principalOf();
const reader = principalOf(Permission.CONNECTION_READ);
const writer = principalOf(Permission.CONNECTION_WRITE);

describe('ConnectionService', () => {
    it('lists the connections the principal may read, never widgets', async () => {
        const { service } = setup([handleOf('alpha'), handleOf('beta')]);

        expect(await service.list(nobody)).toEqual({ data: [] });
        expect(await service.list(principalOf(restricted(Permission.CONNECTION_READ, { name: 'beta' })))).toEqual({
            data: [{
                name: 'beta', 
                type: 'whatsapp', 
                status: 'pairing', 
            }], 
        });
    });

    it('refuses a detail without a grant (403), then answers an unknown name 404', async () => {
        const { service } = setup([handleOf('alpha')]);

        await expect(service.get('alpha', nobody)).rejects.toMatchObject({ status: 403 });
        await expect(service.get('nope', nobody)).rejects.toMatchObject({ status: 403 });
        await expect(service.get('nope', reader)).rejects.toMatchObject({ status: 404 });
    });

    it('shows widgets to a writer only', async () => {
        const { service } = setup([handleOf('alpha')]);

        expect(await service.get('alpha', reader)).toEqual({
            name: 'alpha', 
            type: 'whatsapp', 
            status: 'pairing', 
        });
        expect(await service.get('alpha', writer)).toEqual({
            name: 'alpha',
            type: 'whatsapp',
            status: 'pairing',
            widgets: [{ kind: 'qr', value: QR }],
            canReset: false,
            live: true,
        });
    });

    it('requires write for a writable handle: 403 for a reader, then 404', async () => {
        const { service } = setup([handleOf('alpha')]);

        await expect(service.requireWritable('alpha', reader)).rejects.toMatchObject({ status: 403 });
        await expect(service.requireWritable('nope', reader)).rejects.toMatchObject({ status: 403 });
        await expect(service.requireWritable('nope', writer)).rejects.toMatchObject({ status: 404 });
        expect((await service.requireWritable('alpha', writer)).name).toBe('alpha');
    });

    it('refuses a reset without write, without a reset action and while held elsewhere', async () => {
        const reset = vi.fn(async () => undefined);
        const { service } = setup([
            handleOf('alpha', { reset }),
            handleOf('plain'),
            handleOf('held', { status: 'held_elsewhere', reset }),
        ]);

        await expect(service.reset('alpha', reader)).rejects.toMatchObject({ status: 403 });
        await expect(service.reset('plain', writer)).rejects.toMatchObject({ status: 404, message: 'The connection "plain" offers no reset.' });
        await expect(service.reset('held', writer)).rejects.toMatchObject({ status: 409 });
        expect(reset).not.toHaveBeenCalled();
    });

    it('starts a reset and reports its failure to onError without rejecting', async () => {
        const failure = new Error('reset failed');
        const { service, onError } = setup([handleOf('alpha', {
            reset: async () => {
                throw failure; 
            }, 
        })]);

        expect(await service.reset('alpha', writer)).toEqual({
            name: 'alpha', 
            type: 'whatsapp', 
            status: 'pairing', 
        });

        await flush();

        expect(onError).toHaveBeenCalledWith(failure);
    });
});
