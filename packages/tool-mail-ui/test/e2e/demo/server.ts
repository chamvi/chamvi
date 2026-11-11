/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createApp, defineSimpleAgent, http } from '@chamvi/app';
import { toolMailModule } from '@chamvi/tool-mail/module';
import { toolMailUiModule } from '@chamvi/tool-mail-ui/module';
import { uiModule } from '@chamvi/ui/module';
import { E2E_PORT, E2E_TOKEN } from './constants.ts';

const env = {
    HOST: '127.0.0.1',
    PORT: String(E2E_PORT),
    CHAMVI_TOKENS: JSON.stringify([{
        value: E2E_TOKEN,
        id: 'e2e',
        permissions: '*',
    }]),
    CHAMVI_ENCRYPTION_KEYS: `e2e:${Buffer.alloc(32, 7).toString('base64')}`,
};

const app = createApp({
    agents: [defineSimpleAgent({
        name: 'noop',
        channels: [http.on()],
        run: async () => 'ok',
    })],
    modules: [
        toolMailModule({ env }),
        uiModule({ env }),
        toolMailUiModule(),
    ],
});

await app.start({ env });
