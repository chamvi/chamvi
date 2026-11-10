/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// @vitest-environment happy-dom

import {
    describe,
    expect,
    it,
} from 'vitest';
import { createApp, defineComponent, h } from 'vue';
import ConnectionPanel from '../../../src/connections/ConnectionPanel.vue';
import type { ConnectionDetailWire, ConnectionWidgetWire, IConnectionsApi } from '../../../src/connections/types.ts';
import { flush } from '../../utils/timers.ts';

const WIDGETS = [{ kind: 'qr', value: 'pairing-material' }] as ConnectionWidgetWire[];

const DETAIL = {
    name: 'whatsapp',
    type: 'whatsapp',
    status: 'connecting',
    canReset: false,
    widgets: WIDGETS,
} as ConnectionDetailWire;

function fakeApi(): IConnectionsApi {
    return {
        list: async () => [],
        get: async () => DETAIL,
        reset: async () => DETAIL,
        // the live view is not observed here: the stream never answers
        stream: () => new Promise<Response>(() => {}),
    };
}

async function mount(slots: Record<string, (props: { widgets: ConnectionWidgetWire[] }) => unknown>) {
    const root = document.createElement('div');
    const app = createApp(defineComponent(() => () => h(ConnectionPanel, {
        api: fakeApi(),
        name: 'whatsapp',
        write: true,
    }, slots)));

    app.mount(root);
    await flush();

    return { root, unmount: () => app.unmount() };
}

describe('ConnectionPanel', () => {
    it('hands the widgets to the widgets slot', async () => {
        let seen: ConnectionWidgetWire[] | undefined;
        const { root, unmount } = await mount({
            widgets: (props) => {
                seen = props.widgets;

                return h('p', { 'data-testid': 'custom' }, 'custom widget');
            },
        });

        expect(seen).toEqual(WIDGETS);
        expect(root.querySelector('[data-testid="custom"]')?.textContent).toBe('custom widget');
        unmount();
    });

    it('renders no widget of its own, and never the widget value', async () => {
        const { root, unmount } = await mount({});

        expect(root.querySelector('[data-testid="connection-status"]')).not.toBeNull();
        expect(root.querySelector('.connection-widget')).toBeNull();
        expect(root.innerHTML).not.toContain('pairing-material');
        unmount();
    });
});
