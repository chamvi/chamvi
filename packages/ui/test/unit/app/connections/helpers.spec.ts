/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionStatus } from '@chamvi/core';
import { describe, expect, it } from 'vitest';
import { STATUS_BADGES } from '../../../../app/connections/constants.ts';
import {
    canWriteConnection,
    qrDataUrl,
    statusBadge,
} from '../../../../app/connections/helpers.ts';

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

describe('qrDataUrl', () => {
    it('renders the value to an SVG data URL, offline', () => {
        const url = qrDataUrl('2@pairing-material,abc,def');

        expect(url.startsWith('data:image/svg+xml,')).toBe(true);

        const svg = decodeURIComponent(url.slice('data:image/svg+xml,'.length));

        expect(svg).toMatch(/^<svg[\s>]/);
        expect(svg).not.toContain('pairing-material');
    });

    it('differs per value', () => {
        expect(qrDataUrl('a')).not.toBe(qrDataUrl('b'));
    });
});

describe('permissions', () => {
    it('the QR, the live stream and reset need the write grant', () => {
        expect(canWriteConnection(['connection:whatsapp:write'], 'whatsapp')).toBe(true);
        expect(canWriteConnection(['connection:*:write'], 'whatsapp')).toBe(true);
        expect(canWriteConnection(['*'], 'whatsapp')).toBe(true);
        expect(canWriteConnection(['connection:whatsapp:read'], 'whatsapp')).toBe(false);
        expect(canWriteConnection(['connection:*'], 'whatsapp')).toBe(false);
    });
});
