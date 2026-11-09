/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InvalidAgentDefinitionError, defineModelAgent } from '@chamvi/core';
import { http } from '@chamvi/http';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    configModule,
    engineModule,
    httpModule,
    staticTokensModule,
    storeModule,
    uiPageModule,
} from '@chamvi/app';
import { createModuleHarness } from '@chamvi/app/testing';
import type { ModuleHarness } from '@chamvi/app/testing';
import { uiModule } from '@chamvi/ui/module';
import { textModel } from '../../utils/model.ts';
import {
    TOKENS,
    createRecordingLogger,
    freePort,
} from '../../utils/module.ts';

const ROOT = fileURLToPath(new URL('../../fixtures/build', import.meta.url));

let harnesses: ModuleHarness[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((h) => h.stop()));
    harnesses = [];
});

async function served(env: Record<string, string> = {}, basePath = '') {
    const port = await freePort();
    const harness = await createModuleHarness({
        env: {
            CHAMVI_TOKENS: TOKENS,
            HOST: '127.0.0.1',
            PORT: String(port),
            ...(basePath && { CHAMVI_BASE_PATH: basePath }),
        },
        agents: [defineModelAgent({
            name: 'triage',
            model: textModel(),
            instructions: 'triage',
            channels: [http.on()],
        })],
        modules: [
            configModule({ logger: createRecordingLogger() }),
            storeModule(),
            staticTokensModule(),
            engineModule(),
            httpModule({ metrics: false, rateLimit: false }),
            uiModule({ env, root: ROOT }),
        ],
    });

    harnesses.push(harness);

    const response = await fetch(`http://127.0.0.1:${port}${basePath}/ui/`);
    const html = await response.text();
    const match = /<script type="application\/json" id="chamvi-config">(.*?)<\/script>/s.exec(html);

    return {
        response,
        html,
        config: match ? JSON.parse(match[1]!) as {
            apiBase: string;
            uiBase: string;
            auth: { tokens: boolean; authup?: unknown }
        } : undefined,
    };
}

describe('uiModule', () => {
    it('is named chamvi:ui', () => {
        expect(uiModule({ env: {} }).name).toBe('chamvi:ui');
    });

    it('serves the dashboard under /ui', async () => {
        const { response, config } = await served();

        expect(response.status).toBe(200);
        expect(config).toEqual({
            apiBase: '',
            uiBase: '/ui',
            auth: { tokens: true },
        });
    });

    it('follows CHAMVI_BASE_PATH', async () => {
        const { response, config } = await served({}, '/api');

        expect(response.status).toBe(200);
        expect(config).toMatchObject({ apiBase: '/api', uiBase: '/api/ui' });
    });

    it('authup login only with CHAMVI_UI_AUTHUP_CLIENT_ID', async () => {
        const { config } = await served({
            AUTHUP_URL: 'https://auth.example.com/api',
            CHAMVI_UI_AUTHUP_CLIENT_ID: 'chamvi-ui',
            CHAMVI_UI_AUTHUP_REALM_ID: 'master',
        });

        expect(config?.auth).toEqual({
            tokens: true,
            authup: {
                url: 'https://auth.example.com/api',
                clientId: 'chamvi-ui',
                realmId: 'master',
            },
        });

        const without = await served({ AUTHUP_URL: 'https://auth.example.com/api' });

        expect(without.config?.auth).toEqual({ tokens: true });
    });

    it('CHAMVI_UI_AUTHUP_CLIENT_ID without AUTHUP_URL names AUTHUP_URL', () => {
        expect(() => uiModule({ env: { CHAMVI_UI_AUTHUP_CLIENT_ID: 'chamvi-ui' } }))
            .toThrow(new InvalidAgentDefinitionError('AUTHUP_URL is required.'));
    });

    it('an explicit auth option skips the env', () => {
        expect(() => uiModule({ env: { CHAMVI_UI_AUTHUP_CLIENT_ID: 'chamvi-ui' }, auth: { tokens: true } })).not.toThrow();
    });
});

describe('uiModule with a registered page', () => {
    const MARK = 'the mail page';
    const pageRoots: string[] = [];

    afterEach(async () => {
        await Promise.all(pageRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    });

    async function servedWithPage(order: 'dashboard' | 'page', basePath = '', uiBase?: string) {
        const pageRoot = await mkdtemp(join(tmpdir(), 'chamvi-page-'));

        pageRoots.push(pageRoot);
        await writeFile(join(pageRoot, 'index.html'), `<!doctype html><head><!--chamvi-config--></head><body>${MARK}</body>`);

        const port = await freePort();
        const dashboard = uiModule({
            env: {}, 
            root: ROOT, 
            ...(uiBase && { basePath: uiBase }), 
        });
        const page = uiPageModule({
            name: 'chamvi:tool-mail-ui',
            label: 'Mail',
            types: ['mail'],
            slug: 'tool-mail',
            root: pageRoot,
            ...(uiBase && { uiBase }),
        });
        const harness = await createModuleHarness({
            env: {
                CHAMVI_TOKENS: TOKENS,
                HOST: '127.0.0.1',
                PORT: String(port),
                ...(basePath && { CHAMVI_BASE_PATH: basePath }),
            },
            agents: [defineModelAgent({
                name: 'triage',
                model: textModel(),
                instructions: 'triage',
                channels: [http.on()],
            })],
            modules: [
                configModule({ logger: createRecordingLogger() }),
                storeModule(),
                staticTokensModule(),
                engineModule(),
                httpModule({ metrics: false, rateLimit: false }),
                ...(order === 'dashboard' ? [dashboard, page] : [page, dashboard]),
            ],
        });

        harnesses.push(harness);

        return `http://127.0.0.1:${port}${basePath}${uiBase ?? '/ui'}`;
    }

    it.each([
        ['dashboard', '', undefined],
        ['page', '', undefined],
        ['dashboard', '/agents-app', '/console'],
        ['page', '/agents-app', '/console'],
    ] as const)('a deep link reaches the page with the %s module first (base "%s", ui %s)', async (order, basePath, uiBase) => {
        const origin = await servedWithPage(order, basePath, uiBase);
        const deep = await fetch(`${origin}/ext/tool-mail/accounts/work`);

        expect(deep.status).toBe(200);
        expect(await deep.text()).toContain(MARK);

        const dashboard = await fetch(`${origin}/agents`);

        expect(dashboard.status).toBe(200);
        expect(await dashboard.text()).not.toContain(MARK);
    });
});
