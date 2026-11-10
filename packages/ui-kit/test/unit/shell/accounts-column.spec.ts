/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import type { MeWire } from '../../../src/api/types.ts';
import type { ConnectionTypeWire, ConnectionWire } from '../../../src/connections/types.ts';
import AccountsColumn from '../../../src/shell/AccountsColumn.vue';

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
];

function me(permissions: string[]): MeWire {
    return {
        id: 'peter',
        kind: 'token',
        permissions,
    };
}

function render(props: {
    type?: ConnectionTypeWire; 
    principal?: MeWire; 
    current?: string 
}): Promise<string> {
    return renderToString(createSSRApp({
        render: () => h(AccountsColumn, {
            type: props.type ?? TYPE,
            connections: CONNECTIONS,
            principal: props.principal ?? me(['connections:create']),
            current: props.current,
        }),
    }));
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

    it('marks the current account', async () => {
        const html = await render({ current: 'mail-support' });

        expect(html).toMatch(/data-account="mail-support"[^>]*aria-current="page"/u);
    });

    it('shows Add for a multi-instance type to a holder of connections:create', async () => {
        expect(await render({})).toContain('+ Add account');
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

    it('hides Add without connections:create', async () => {
        expect(await render({ principal: me(['connection:*:write']) })).not.toContain('+ Add account');
    });

    it('hides Add when the app cannot create accounts of the type', async () => {
        expect(await render({ type: { ...TYPE, creatable: false } })).not.toContain('+ Add account');
    });
});
