/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { 
    afterEach, 
    describe, 
    expect, 
    it, 
} from 'vitest';
import { AppToken, configModule } from '@chamvi/app';
import { buildModuleHarness } from '@chamvi/app/testing';
import type { ModuleHarness } from '@chamvi/app/testing';
import { chatDiscordUiModule } from '@chamvi/chat-discord-ui/module';

let harnesses: ModuleHarness[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((harness) => harness.stop()));
    harnesses = [];
});

async function contributions(options?: { uiBase?: string }) {
    const harness = buildModuleHarness({ env: {}, modules: [configModule(), chatDiscordUiModule(options)] });

    harnesses.push(harness);
    await harness.setup();

    return {
        routes: harness.container.resolveAll(AppToken.HTTP_ROUTES),
        pages: harness.container.resolveAll(AppToken.UI_PAGES),
    };
}

describe('chatDiscordUiModule()', () => {
    it('is named after its package', () => {
        expect(chatDiscordUiModule().name).toBe('chamvi:chat-discord-ui');
    });

    it('contributes routes and a UiPage', async () => {
        const { routes, pages } = await contributions();

        expect(routes).toHaveLength(1);
        expect(routes[0]).toMatchObject({
            method: 'GET', 
            path: '/ui/ext/chat-discord', 
            prefix: true, 
        });
        expect(pages).toEqual([{
            slug: 'chat-discord',
            label: 'Discord',
            types: ['discord'],
            path: '/ui/ext/chat-discord',
        }]);
    });

    it('forwards uiBase', async () => {
        const { routes, pages } = await contributions({ uiBase: '/console' });

        expect(routes[0]).toMatchObject({ path: '/console/ext/chat-discord' });
        expect(pages[0]).toMatchObject({ path: '/console/ext/chat-discord' });
    });
});
