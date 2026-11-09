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
import { githubUiModule } from '@chamvi/github-ui/module';

let harnesses: ModuleHarness[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((harness) => harness.stop()));
    harnesses = [];
});

async function contributions(options?: { uiBase?: string }) {
    const harness = buildModuleHarness({ env: {}, modules: [configModule(), githubUiModule(options)] });

    harnesses.push(harness);
    await harness.setup();

    return {
        routes: harness.container.resolveAll(AppToken.HTTP_ROUTES),
        pages: harness.container.resolveAll(AppToken.UI_PAGES),
    };
}

describe('githubUiModule()', () => {
    it('is named after its package', () => {
        expect(githubUiModule().name).toBe('chamvi:github-ui');
    });

    it('contributes routes and a UiPage', async () => {
        const { routes, pages } = await contributions();

        expect(routes).toHaveLength(1);
        expect(routes[0]).toMatchObject({
            method: 'GET', 
            path: '/ui/ext/github', 
            prefix: true, 
        });
        expect(pages).toEqual([{
            slug: 'github',
            label: 'GitHub',
            types: ['github'],
            path: '/ui/ext/github',
        }]);
    });

    it('forwards uiBase', async () => {
        const { routes, pages } = await contributions({ uiBase: '/console' });

        expect(routes[0]).toMatchObject({ path: '/console/ext/github' });
        expect(pages[0]).toMatchObject({ path: '/console/ext/github' });
    });
});
