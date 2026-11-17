/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModel } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import {
    InvalidAgentDefinitionError,
    defineModelAgent,
    defineTool,
} from '@chamvi/core';
import type { AgentDefinition, IEngine } from '@chamvi/core';
import { injectGithubContext, provideGithubContext } from '@chamvi/github';
import { createGithubFixture } from '../../utils/app.ts';
import { mockModel } from '../../utils/model.ts';
import { createTestEngine } from '@chamvi/test-kit';

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

function setup(model: LanguageModel, tools: AgentDefinition['tools']) {
    const { clock, gh } = createGithubFixture();
    const errors: unknown[] = [];
    const engine = createTestEngine({
        agents: [defineModelAgent({
            name: 'triage',
            instructions: 'Triage.',
            model,
            tools,
        })],
        clock,
        onError: (error) => {
            errors.push(error);
        },
    });

    engines.push(engine);

    return {
        engine,
        gh,
        errors,
    };
}

async function run(engine: IEngine) {
    const { runId } = await engine.dispatch({
        agent: 'triage',
        trigger: 'http',
        channel: 'http',
        payload: {},
    });

    await engine.idle();

    return engine.runService.findOne(runId);
}

describe('github context', () => {
    it('a tool injects the provided app', async () => {
        const seen: unknown[] = [];
        const use = defineTool({
            inputSchema: z.object({}),
            execute: async (_input, { context }) => {
                seen.push(injectGithubContext(context));

                return 'ok';
            },
        });
        const model = mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'use',
                    input: {},
                }],
            },
            { parts: [{ type: 'text', text: 'done' }] },
        ]);
        const {
            engine,
            gh,
        } = setup(model, { use });

        provideGithubContext(engine, gh);
        await engine.start();
        expect((await run(engine))?.status).toBe('completed');
        expect(seen).toHaveLength(1);
        expect(seen[0]).toBe(gh);
    });

    it('the tools factory builds the read tools from the injected app', async () => {
        const model = mockModel([{ parts: [{ type: 'text', text: 'done' }] }]);
        const {
            engine,
            gh,
        } = setup(model, (ctx) => injectGithubContext(ctx).readTools());

        provideGithubContext(engine, gh);
        await engine.start();
        expect((await run(engine))?.status).toBe('completed');

        const offered = (model.doStreamCalls[0]?.tools ?? []).map((t) => t.name);

        expect(offered).toContain('github_get_issue');
    });

    it('without provide the run fails naming github', async () => {
        const model = mockModel([{ parts: [{ type: 'text', text: 'done' }] }]);
        const {
            engine,
            errors,
        } = setup(model, (ctx) => injectGithubContext(ctx).readTools());

        await engine.start();

        const result = await run(engine);

        expect(result?.status).toBe('failed');
        expect(result?.error?.code).toBe('context_not_provided');
        expect(result?.error?.message).toContain('"github"');
        expect(model.doStreamCalls).toHaveLength(0);
        expect(errors).toHaveLength(1);
    });

    it('a second provide throws', () => {
        const model = mockModel([]);
        const { engine, gh } = setup(model, {});

        provideGithubContext(engine, gh);
        expect(() => provideGithubContext(engine, gh)).toThrow(InvalidAgentDefinitionError);
    });
});
