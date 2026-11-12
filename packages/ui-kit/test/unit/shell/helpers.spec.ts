/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import { describe, expect, it } from 'vitest';
import type { ConnectionWire } from '../../../src/connections/types.ts';
import { visibleUiPages } from '../../../src/shell/helpers.ts';
import type { UiPageWire } from '../../../src/shell/types.ts';

const MAIL: UiPageWire = {
    slug: 'tool-mail',
    label: 'Mail',
    path: '/ui/ext/tool-mail',
    types: ['mail'],
};

const CALENDAR: UiPageWire = {
    slug: 'tool-calendar',
    label: 'Calendar',
    path: '/ui/ext/tool-calendar',
    types: ['calendar'],
};

const MAIL_WORK: ConnectionWire = {
    name: 'mail-work',
    type: 'mail',
    status: 'connected',
};

const allowing = (...names: string[]) => (name: string) => names.includes(name);

describe('visibleUiPages', () => {
    it('shows a page whose type has a listed connection', () => {
        expect(visibleUiPages([MAIL, CALENDAR], [MAIL_WORK], allowing())).toEqual([MAIL]);
    });

    it('shows a page without a listed connection only to a session that may create connections', () => {
        expect(visibleUiPages([MAIL, CALENDAR], [], allowing(Permission.CONNECTION_CREATE))).toEqual([MAIL, CALENDAR]);
        expect(visibleUiPages([MAIL, CALENDAR], [], allowing(Permission.CONNECTION_READ, Permission.CONNECTION_WRITE))).toEqual([]);
    });
});
