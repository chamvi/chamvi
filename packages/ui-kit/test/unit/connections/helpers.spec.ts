/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';
import type { ConnectionStatus } from '@chamvi/core';
import { describe, expect, it } from 'vitest';
import { STATUS_BADGES } from '../../../src/connections/constants.ts';
import {
    canAddAccount,
    canReadConnection,
    canWriteConnection,
    connectionBadge,
    connectionProblem,
    statusBadge,
} from '../../../src/connections/helpers.ts';
import type { ConnectionTypeWire } from '../../../src/connections/types.ts';
import { ALL, grant } from '../../utils/permissions.ts';

describe('connectionBadge', () => {
    it('reads the configuration first', () => {
        expect(connectionBadge({
            status: 'disconnected', 
            state: 'not_configured', 
            live: false, 
        }).label).toBe('not configured');
        expect(connectionBadge({ status: 'connected', state: 'incomplete' }).label).toBe('incomplete');
    });

    it('does not read a configured connection without a handle as disconnected', () => {
        expect(connectionBadge({
            status: 'disconnected', 
            state: 'configured', 
            live: false, 
        })).toEqual({ label: 'configured', tone: 'completed' });
    });

    it('keeps the live status of a handle, and of a connection with no configuration', () => {
        expect(connectionBadge({ status: 'failed', state: 'configured' }).label).toBe('failed');
        expect(connectionBadge({ status: 'pairing' }).label).toBe('pairing');
    });
});

describe('connectionProblem', () => {
    it('says what is missing or why, and nothing for a configured one', () => {
        expect(connectionProblem({ state: 'not_configured' })).toBe('Not configured yet.');
        expect(connectionProblem({ state: 'incomplete', missing: ['Password', 'Host'] })).toBe('Incomplete: Password, Host missing.');
        expect(connectionProblem({ state: 'incomplete', reason: 'CHAMVI_PUBLIC_URL is required.' })).toBe('Incomplete: CHAMVI_PUBLIC_URL is required.');
        expect(connectionProblem({ state: 'configured' })).toBeUndefined();
        expect(connectionProblem({})).toBeUndefined();
    });
});

const STATUSES: ConnectionStatus[] = [
    'disconnected',
    'pairing',
    'connecting',
    'connected',
    'logged_out',
    'held_elsewhere',
    'failed',
];

describe('statusBadge', () => {
    it('labels every status in words and gives it a tone', () => {
        for (const status of STATUSES) {
            const badge = statusBadge(status);

            expect(badge.label).not.toContain('_');
            expect(badge.tone).toMatch(/^[a-z]+$/);
        }

        expect(Object.keys(STATUS_BADGES).sort()).toEqual([...STATUSES].sort());
    });

    it('maps the statuses onto the dashboard tones', () => {
        expect(statusBadge('connected')).toEqual({ label: 'connected', tone: 'completed' });
        expect(statusBadge('pairing')).toEqual({ label: 'pairing', tone: 'waiting' });
        expect(statusBadge('connecting')).toEqual({ label: 'connecting', tone: 'running' });
        expect(statusBadge('held_elsewhere')).toEqual({ label: 'held elsewhere', tone: 'waiting' });
        expect(statusBadge('logged_out')).toEqual({ label: 'logged out', tone: 'failed' });
        expect(statusBadge('failed')).toEqual({ label: 'failed', tone: 'failed' });
        expect(statusBadge('disconnected')).toEqual({ label: 'disconnected', tone: 'cancelled' });
    });

    it('shows a status it does not know as is, muted', () => {
        expect(statusBadge('suspended' as ConnectionStatus)).toEqual({ label: 'suspended', tone: 'queued' });
    });
});

const holder = (...permissions: PermissionBinding[]) => ({ permissions });

const WHATSAPP = { name: 'whatsapp', type: 'whatsapp' };
const MAIL_WORK = { name: 'mail-work', type: 'mail' };

const MAIL_TYPE: ConnectionTypeWire = {
    type: 'mail',
    label: 'Mail',
    multiple: true,
    creatable: true,
    testable: false,
    fields: [],
};

describe('permissions', () => {
    it('widgets, the live stream and reset need the write grant', async () => {
        expect(await canWriteConnection(holder(grant(Permission.CONNECTION_WRITE)), WHATSAPP)).toBe(true);
        expect(await canWriteConnection(holder(...ALL), WHATSAPP)).toBe(true);
        expect(await canWriteConnection(holder(grant(Permission.CONNECTION_READ)), WHATSAPP)).toBe(false);
        expect(await canWriteConnection(holder(), WHATSAPP)).toBe(false);
        expect(await canWriteConnection(undefined, WHATSAPP)).toBe(false);
    });

    it('a write grant restricted to one connection writes only that one', async () => {
        const restricted = holder(grant(Permission.CONNECTION_WRITE, { name: 'whatsapp' }));

        expect(await canWriteConnection(restricted, WHATSAPP)).toBe(true);
        expect(await canWriteConnection(restricted, MAIL_WORK)).toBe(false);
    });

    it('a write grant restricted by type checks the connection\'s type', async () => {
        const restricted = holder(grant(Permission.CONNECTION_WRITE, { type: 'mail' }));

        expect(await canWriteConnection(restricted, MAIL_WORK)).toBe(true);
        expect(await canWriteConnection(restricted, WHATSAPP)).toBe(false);
        // a connection of unknown type is checked by name alone, as the server does
        expect(await canWriteConnection(restricted, { name: 'mail-work' })).toBe(false);
        expect(await canWriteConnection(holder(grant(Permission.CONNECTION_WRITE, { name: 'mail-work' })), { name: 'mail-work' })).toBe(true);
    });

    it('reading takes the read or the write grant for the connection', async () => {
        expect(await canReadConnection(holder(grant(Permission.CONNECTION_READ, { name: 'mail-work' })), MAIL_WORK)).toBe(true);
        expect(await canReadConnection(holder(grant(Permission.CONNECTION_WRITE, { name: 'mail-work' })), MAIL_WORK)).toBe(true);
        expect(await canReadConnection(holder(grant(Permission.CONNECTION_READ, { name: 'mail-work' })), WHATSAPP)).toBe(false);
        expect(await canReadConnection(holder(grant(Permission.CONNECTION_CREATE)), MAIL_WORK)).toBe(false);
    });

    it('adding an account needs the create grant for the type', async () => {
        expect(await canAddAccount(MAIL_TYPE, holder(grant(Permission.CONNECTION_CREATE)))).toBe(true);
        expect(await canAddAccount(MAIL_TYPE, holder(grant(Permission.CONNECTION_CREATE, { type: 'mail' })))).toBe(true);
        expect(await canAddAccount(MAIL_TYPE, holder(grant(Permission.CONNECTION_CREATE, { type: 'calendar' })))).toBe(false);
        expect(await canAddAccount(MAIL_TYPE, holder(grant(Permission.CONNECTION_WRITE)))).toBe(false);
        expect(await canAddAccount(MAIL_TYPE, undefined)).toBe(false);
    });

    it('adding an account needs a type that takes several, created here', async () => {
        const creator = holder(grant(Permission.CONNECTION_CREATE));

        expect(await canAddAccount({ ...MAIL_TYPE, multiple: false }, creator)).toBe(false);
        expect(await canAddAccount({ ...MAIL_TYPE, creatable: false }, creator)).toBe(false);
    });
});
