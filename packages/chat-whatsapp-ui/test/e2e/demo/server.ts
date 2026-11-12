/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    AppToken,
    ModuleName,
    createApp,
    defineSimpleAgent,
    http,
} from '@chamvi/app';
import type { IContainer, IModule } from '@chamvi/app';
import { chatWhatsappUiModule } from '@chamvi/chat-whatsapp-ui/module';
import type {
    ConnectionStatus,
    ConnectionWidget,
    IConnectionHandle,
} from '@chamvi/core';
import { uiModule } from '@chamvi/ui/module';
import {
    E2E_PORT,
    E2E_QR,
    E2E_TOKEN,
} from './constants.ts';

const env = {
    HOST: '127.0.0.1',
    PORT: String(E2E_PORT),
    CHAMVI_TOKENS: JSON.stringify([{
        value: E2E_TOKEN,
        id: 'e2e',
        permissions: '*',
    }]),
};

/** A handle like `whatsappModule()`'s: pairing with a QR, `POST /demo/connect` links it, reset pairs again. */
function demoConnectionModule(): IModule {
    const listeners = new Set<() => void>();
    let status: ConnectionStatus = 'pairing';
    let widgets: ConnectionWidget[] = [{ kind: 'qr', value: E2E_QR }];
    const change = (next: ConnectionStatus, nextWidgets: ConnectionWidget[]) => {
        status = next;
        widgets = nextWidgets;

        for (const listener of listeners) {
            listener();
        }
    };
    const handle: IConnectionHandle = {
        name: 'whatsapp',
        type: 'whatsapp',
        status: () => status,
        widgets: () => [...widgets],
        subscribe(listener) {
            listeners.add(listener);

            return () => listeners.delete(listener);
        },
        actions: {
            async reset() {
                change('pairing', [{ kind: 'qr', value: `${E2E_QR}-reset` }]);
            },
        },
    };

    return {
        name: 'demo:connection',
        dependencies: [ModuleName.CONFIG],
        async setup(container: IContainer) {
            container.registerMany(AppToken.CONNECTIONS, { useValue: handle });
            container.registerMany(AppToken.HTTP_ROUTES, {
                useValue: {
                    method: 'POST',
                    path: '/demo/connect',
                    handler: async (request) => {
                        await request.authorize();
                        change('connected', []);

                        return { status: 204 };
                    },
                },
            });
        },
    };
}

const app = createApp({
    agents: [defineSimpleAgent({
        name: 'noop',
        channels: [http.on()],
        run: async () => 'ok',
    })],
    modules: [
        demoConnectionModule(),
        uiModule({ env }),
        chatWhatsappUiModule(),
    ],
});

await app.start({ env });
