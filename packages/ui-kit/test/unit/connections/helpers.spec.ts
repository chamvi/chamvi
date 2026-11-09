/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionStatus } from '@chamvi/core';
import { describe, expect, it } from 'vitest';
import { STATUS_BADGES } from '../../../src/connections/constants.ts';
import {
    canWriteConnection,
    connectionBadge,
    connectionProblem,
    statusBadge,
} from '../../../src/connections/helpers.ts';

describe('connectionBadge', () => {
    it('reads the configuration first', () => {
        expect(connectionBadge({ status: 'disconnected', state: 'not_configured', live: false }).label).toBe('not configured');
        expect(connectionBadge({ status: 'connected', state: 'incomplete' }).label).toBe('incomplete');
    });

    it('does not read a configured connection without a handle as disconnected', () => {
        expect(connectionBadge({ status: 'disconnected', state: 'configured', live: false })).toEqual({ label: 'configured', tone: 'completed' });
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

describe('permissions', () => {
    it('widgets, the live stream and reset need the write grant', () => {
        expect(canWriteConnection(['connection:whatsapp:write'], 'whatsapp')).toBe(true);
        expect(canWriteConnection(['connection:*:write'], 'whatsapp')).toBe(true);
        expect(canWriteConnection(['*'], 'whatsapp')).toBe(true);
        expect(canWriteConnection(['connection:whatsapp:read'], 'whatsapp')).toBe(false);
        expect(canWriteConnection(['connection:*'], 'whatsapp')).toBe(false);
    });
});
