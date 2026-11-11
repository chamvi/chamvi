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
import { chatWhatsappUiModule } from '@chamvi/chat-whatsapp-ui/module';

let harnesses: ModuleHarness[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((harness) => harness.stop()));
    harnesses = [];
});

async function contributions(options?: { uiBase?: string }) {
    const harness = buildModuleHarness({ env: {}, modules: [configModule(), chatWhatsappUiModule(options)] });

    harnesses.push(harness);
    await harness.setup();

    return {
        routes: harness.container.resolveAll(AppToken.HTTP_ROUTES),
        pages: harness.container.resolveAll(AppToken.UI_PAGES),
    };
}

describe('chatWhatsappUiModule()', () => {
    it('is named after its package', () => {
        expect(chatWhatsappUiModule().name).toBe('chamvi:chat-whatsapp-ui');
    });

    it('contributes routes and a UiPage', async () => {
        const { routes, pages } = await contributions();

        expect(routes).toHaveLength(1);
        expect(routes[0]).toMatchObject({
            method: 'GET', 
            path: '/ui/ext/chat-whatsapp', 
            prefix: true, 
        });
        expect(pages).toEqual([{
            slug: 'chat-whatsapp',
            label: 'WhatsApp',
            types: ['whatsapp'],
            path: '/ui/ext/chat-whatsapp',
        }]);
    });

    it('forwards uiBase', async () => {
        const { routes, pages } = await contributions({ uiBase: '/console' });

        expect(routes[0]).toMatchObject({ path: '/console/ext/chat-whatsapp' });
        expect(pages[0]).toMatchObject({ path: '/console/ext/chat-whatsapp' });
    });
});
