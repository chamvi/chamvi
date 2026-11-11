/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// @vitest-environment happy-dom

import { Permission } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';
import { 
    afterEach, 
    describe, 
    expect, 
    it, 
} from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import type { MeWire } from '../../../src/api/types.ts';
import type { ConnectionTypeWire, ConnectionWire } from '../../../src/connections/types.ts';
import AccountsColumn from '../../../src/shell/AccountsColumn.vue';
import { grant } from '../../utils/permissions.ts';
import { flush } from '../../utils/timers.ts';

const TYPE: ConnectionTypeWire = {
    type: 'mail',
    label: 'Mail',
    multiple: true,
    creatable: true,
    testable: false,
    fields: [],
};

const CONNECTIONS: ConnectionWire[] = [
    {
        name: 'mail-work',
        type: 'mail',
        status: 'connected',
        account: 'work',
    },
    {
        name: 'mail-support',
        type: 'mail',
        status: 'failed',
        account: 'support',
    },
    {
        name: 'wa', 
        type: 'whatsapp', 
        status: 'pairing', 
    },
    {
        name: 'mail-new',
        type: 'mail',
        status: 'disconnected',
        live: false,
        account: 'new',
        state: 'not_configured',
    },
    {
        name: 'mail-half',
        type: 'mail',
        status: 'disconnected',
        live: false,
        account: 'half',
        state: 'incomplete',
        missing: ['Password'],
    },
    {
        name: 'mail-idle',
        type: 'mail',
        status: 'disconnected',
        live: false,
        account: 'idle',
        state: 'configured',
    },
];

let mounted: App | undefined;

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    document.body.innerHTML = '';
});

function me(permissions: PermissionBinding[]): MeWire {
    return {
        id: 'peter',
        kind: 'token',
        permissions,
    };
}

async function render(props: {
    type?: ConnectionTypeWire; 
    principal?: MeWire; 
    current?: string 
}): Promise<string> {
    const app = createApp({
        render: () => h(AccountsColumn, {
            type: props.type ?? TYPE,
            connections: CONNECTIONS,
            principal: props.principal ?? me([grant(Permission.CONNECTION_CREATE)]),
            current: props.current,
        }),
    });

    document.body.innerHTML = '<div id="app"></div>';
    app.mount('#app');
    mounted = app;
    await flush();
    await nextTick();

    return document.body.innerHTML;
}

describe('AccountsColumn', () => {
    it('lists the accounts of its type with a status dot', async () => {
        const html = await render({});

        expect(html).toContain('work');
        expect(html).toContain('support');
        expect(html).not.toContain('wa<');
        expect(html).toContain('dot-completed');
        expect(html).toContain('dot-failed');
    });

    it('shows a not configured and an incomplete account, and says why', async () => {
        const html = await render({});

        expect(html).toMatch(/data-account="mail-new"[\s\S]*not configured/u);
        expect(html).toMatch(/data-account="mail-half"[^>]*title="Incomplete: Password missing\."/u);
        expect(html).toContain('>incomplete<');
    });

    it('does not read a configured account without a live handle as a failure', async () => {
        const html = await render({});
        const idle = /data-account="mail-idle"[\s\S]*?<\/button>/u.exec(html)?.[0] ?? '';

        expect(idle).toContain('dot-completed');
        expect(idle).not.toContain('disconnected');
    });

    it('marks the current account', async () => {
        const html = await render({ current: 'mail-support' });

        expect(html).toMatch(/data-account="mail-support"[^>]*aria-current="page"/u);
    });

    it('shows Add for a multi-instance type to a holder of chamvi_connection_create', async () => {
        expect(await render({})).toContain('+ Add account');
    });

    it('shows Add to a creator restricted to the type', async () => {
        expect(await render({ principal: me([grant(Permission.CONNECTION_CREATE, { type: 'mail' })]) })).toContain('+ Add account');
    });

    it('hides Add from a creator restricted to another type', async () => {
        expect(await render({ principal: me([grant(Permission.CONNECTION_CREATE, { type: 'calendar' })]) })).not.toContain('+ Add account');
    });

    it('hides Add for a single-instance type', async () => {
        expect(await render({
            type: {
                ...TYPE, 
                multiple: false, 
                creatable: false, 
            }, 
        })).not.toContain('+ Add account');
    });

    it('hides Add without chamvi_connection_create', async () => {
        expect(await render({ principal: me([grant(Permission.CONNECTION_WRITE)]) })).not.toContain('+ Add account');
    });

    it('hides Add when the app cannot create accounts of the type', async () => {
        expect(await render({ type: { ...TYPE, creatable: false } })).not.toContain('+ Add account');
    });
});
