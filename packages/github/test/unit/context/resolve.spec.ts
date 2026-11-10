/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineModelAgent, defineTool } from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { createGithubApp, injectGithubContext } from '@chamvi/github';
import type { IGithubApp } from '@chamvi/github';
import { ControllableClock, createFakeGithub } from '@chamvi/test-kit';
import {
    AppToken,
    configModule,
    engineModule,
    storeModule,
} from '@chamvi/app';
import type { IModule } from '@chamvi/app';
import { createModuleHarness } from '@chamvi/app/testing';
import type { ModuleHarness } from '@chamvi/app/testing';
import { githubModule } from '@chamvi/github/module';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import { mockModel } from '../../utils/model.ts';
import { createRecordingLogger } from '../../utils/module.ts';

const clock = new ControllableClock(new Date('2026-10-20T10:00:00Z'));
const fake = createFakeGithub({ appId: '1', clock });

function appOf(appId: string): IGithubApp {
    return createGithubApp({
        appId,
        privateKey: fake.privateKey,
        webhookSecret: 'a',
        clock,
        fetch: fake.fetch,
    });
}

const harnesses: ModuleHarness[] = [];

afterEach(async () => {
    for (const harness of harnesses.splice(0)) {
        await harness.stop();
    }
});

function agentSeeing(name: string, seen: Record<string, IGithubApp>): Agent {
    return defineModelAgent({
        name,
        instructions: name,
        model: mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'probe',
                    input: {},
                }],
            },
            { parts: [{ type: 'text', text: 'done' }] },
        ]),
        tools: {
            probe: defineTool({
                inputSchema: z.object({}),
                execute: async (_input, { context }) => {
                    seen[name] = injectGithubContext(context);

                    return 'ok';
                },
            }),
        },
    });
}

async function harnessWith(agents: Agent[], modules: IModule[]): Promise<ModuleHarness> {
    const harness = await createModuleHarness({
        env: {},
        agents,
        modules: [
            configModule({ logger: createRecordingLogger() }),
            storeModule(),
            engineModule(),
            ...modules,
        ],
    });

    harnesses.push(harness);

    return harness;
}

describe('injectGithubContext across modules', () => {
    it('resolves the targeted module, then the fallback', async () => {
        const seen: Record<string, IGithubApp> = {};
        const acme = appOf('2');
        const fallback = appOf('3');
        const harness = await harnessWith(
            [agentSeeing('triager', seen), agentSeeing('other', seen)],
            [
                githubModule({ app: fallback, env: {} }),
                githubModule({
                    name: 'acme',
                    agents: ['triager'],
                    app: acme,
                    env: {},
                }),
            ],
        );
        const engine = harness.container.resolve(AppToken.ENGINE);

        await engine.dispatch({
            agent: 'triager',
            trigger: 'http',
            channel: 'http',
            payload: {},
        });
        await engine.dispatch({
            agent: 'other',
            trigger: 'http',
            channel: 'http',
            payload: {},
        });
        await engine.idle();

        expect(harness.reported).toEqual([]);
        expect(seen.triager).toBe(acme);
        expect(seen.other).toBe(fallback);
    });

    it('an untargeted agent with no fallback gets a not-configured tool error, the run does not fail', async () => {
        const model = mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'github_get_issue',
                    input: { repo: 'octo/demo', number: 7 },
                }],
            },
            { parts: [{ type: 'text', text: 'done' }] },
        ]);
        const agent = defineModelAgent({
            name: 'stranger',
            instructions: 'stranger',
            model,
            tools: (ctx) => injectGithubContext(ctx).readTools(),
        });
        const harness = await harnessWith([agent], [githubModule({
            name: 'acme',
            agents: ['triager'],
            app: appOf('2'),
            env: {},
        })]);
        const engine = harness.container.resolve(AppToken.ENGINE);
        const { runId } = await engine.dispatch({
            agent: 'stranger',
            trigger: 'http',
            channel: 'http',
            payload: {},
        });

        await engine.idle();

        expect((await engine.getRun(runId))?.status).toBe('completed');
        expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain('The connection \\"github\\" is not configured.');
    });
});
