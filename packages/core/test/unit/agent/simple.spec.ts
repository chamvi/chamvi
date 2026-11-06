/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Output, tool } from 'ai';
import type { LanguageModel, ToolSet } from 'ai';
import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import { z } from 'zod';
import {
    Engine,
    InvalidAgentDefinitionError,
    agent,
    agentChannel,
    defineModelAgent,
    defineSimpleAgent,
} from '@chamvi/core';
import type {
    Agent,
    AgentDefinition,
    ModelAgent,
    ModelAgentDefinition,
    SimpleAgent,
    SimpleAgentDefinition,
    SimpleRunContext,
    ToolContext,
} from '@chamvi/core';
import { EngineSkills } from '../../../src/engine/skills/module.ts';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { EMPTY_SKILL_CONTRIBUTION } from '../../../src/skill/constants.ts';
import { fakeSkillRuntime } from '../../utils/skill-runtime.ts';

const run = () => 'ok';

describe('simple agents', () => {
    it('defines an agent with run and no model', () => {
        const fan = defineSimpleAgent({
            name: 'fan',
            run,
            description: 'Fans out.',
        });

        expect(fan.definition.run).toBe(run);
        expect(fan.definition.description).toBe('Fans out.');
        expect(fan.definition.budget.timeoutMs).toBeGreaterThan(0);
        expect(fan.kind).toBe('simple');
    });

    it('tells a model agent apart by its kind', () => {
        const model = defineModelAgent({
            name: 'm',
            model: {} as LanguageModel,
            instructions: 'x',
        });

        expect(model.kind).toBe('model');
        expect(model.definition.budget.maxSteps).toBeGreaterThan(0);
    });

    it.each([
        ['defineModelAgent', defineModelAgent],
    ])('%s refuses run, pointing at defineSimpleAgent', (_, define) => {
        const def = {
            name: 'fan',
            instructions: 'x',
            run,
        } as unknown as ModelAgentDefinition;

        expect(() => define(def)).toThrow(InvalidAgentDefinitionError);
        expect(() => define(def)).toThrow(/defineSimpleAgent/);
    });

    it.each([
        ['an unknown kind', { kind: 'code' }],
        ['no kind', { kind: undefined }],
        ['a simple kind without run', {
            kind: 'simple',
            definition: {
                name: 'm', 
                instructions: 'x', 
                budget: {}, 
            }, 
        }],
        ['a model kind with run', {
            kind: 'model',
            definition: {
                name: 'm', 
                run, 
                budget: {}, 
            }, 
        }],
    ])('refuses to register %s', async (_, patch) => {
        const base = defineModelAgent({
            name: 'm', 
            model: {} as LanguageModel, 
            instructions: 'x', 
        });
        const broken = { ...base, ...patch } as unknown as Agent;
        const engine = new Engine({ store: createMemoryStore(), agents: [] });

        expect(() => new Engine({ store: createMemoryStore(), agents: [broken] })).toThrow(InvalidAgentDefinitionError);
        expect(() => engine.checkAgent(broken)).toThrow(InvalidAgentDefinitionError);
        await expect(engine.putAgent(broken)).rejects.toThrow(InvalidAgentDefinitionError);
        expect(engine.getAgent('m')).toBeUndefined();
    });

    it('registers on an engine without a default model', async () => {
        const fan = defineSimpleAgent({ name: 'fan', run });
        const engine = new Engine({ store: createMemoryStore(), agents: [fan] });

        expect(() => engine.checkAgent(fan)).not.toThrow();
        await expect(engine.putAgent(defineSimpleAgent({ name: 'other', run }))).resolves.toBeDefined();
        expect(engine.getAgent('other')).toBeDefined();
    });

    it('gets the empty skill contribution, global skills ignored', async () => {
        const global = fakeSkillRuntime({
            contribution: Object.freeze({
                instructions: 'global',
                tools: {},
                checkTools: () => {},
            }),
        });
        const skills = new EngineSkills([global.input]);
        const fan = defineSimpleAgent({ name: 'fan', run });

        skills.checkAgent(fan);
        await skills.prepare([fan], { signal: new AbortController().signal });

        expect(skills.get(fan)).toBe(EMPTY_SKILL_CONTRIBUTION);
        expect(global.calls.checks).toBe(0);
    });

    it('keeps dispatch role subscriptions', () => {
        const fan = defineSimpleAgent({
            name: 'fan',
            run,
            channels: [agent.on({ role: 'go' })], 
        });

        expect(() => new Engine({
            store: createMemoryStore(), 
            agents: [fan], 
            channels: [agentChannel()], 
        })).not.toThrow();
    });

    it.each([
        ['instructions', { instructions: 'x' }],
        ['model', { model: {} as LanguageModel }],
        ['skills', { skills: [] }],
        ['output', { output: Output.text() }],
        ['conversation', { conversation: true }],
        ['toolsContext', { toolsContext: {} }],
    ])('refuses run with %s', (field, extra) => {
        const def = {
            name: 'fan', 
            run, 
            ...extra, 
        } as unknown as SimpleAgentDefinition;

        expect(() => defineSimpleAgent(def)).toThrow(InvalidAgentDefinitionError);
        expect(() => defineSimpleAgent(def)).toThrow(new RegExp(`"${field}"`));
    });

    it('refuses a tools factory', () => {
        const def = {
            name: 'fan', 
            run, 
            tools: () => ({}), 
        } as unknown as SimpleAgentDefinition;

        expect(() => defineSimpleAgent(def)).toThrow(InvalidAgentDefinitionError);
        expect(() => defineSimpleAgent(def)).toThrow(/"tools"/);
    });

    it('refuses a run that is not a function', () => {
        const def = { name: 'fan', run: 'x' } as unknown as SimpleAgentDefinition;

        expect(() => defineSimpleAgent(def)).toThrow(InvalidAgentDefinitionError);
        expect(() => defineSimpleAgent(def)).toThrow(/"run"/);
    });

    it('keeps the private flag', () => {
        expect(defineSimpleAgent({
            name: 'fan', 
            run, 
            private: true, 
        }).definition.private).toBe(true);
        expect(defineSimpleAgent({ name: 'fan', run }).definition.private).toBeUndefined();
    });

    it('refuses a private flag that is not a boolean', () => {
        const def = {
            name: 'fan', 
            run, 
            private: 'yes', 
        } as unknown as SimpleAgentDefinition;

        expect(() => defineSimpleAgent(def)).toThrow(InvalidAgentDefinitionError);
        expect(() => defineSimpleAgent(def)).toThrow('Agent "fan": private must be a boolean.');
    });

    it('refuses an empty description', () => {
        expect(() => defineSimpleAgent({
            name: 'fan',
            run,
            description: '', 
        })).toThrow(InvalidAgentDefinitionError);
    });

    it('keeps the tool checks on a plain tool set', () => {
        const tools: ToolSet = {
            gated: tool({
                inputSchema: z.object({}),
                needsApproval: true,
                execute: () => 'x',
            }),
        };

        expect(() => defineSimpleAgent({
            name: 'fan',
            run,
            tools, 
        })).toThrow(/needsApproval/);
    });

    it('narrows the agent and its definition by kind', () => {
        expectTypeOf<Agent>().toEqualTypeOf<ModelAgent | SimpleAgent>();
        expectTypeOf(defineModelAgent).returns.toEqualTypeOf<ModelAgent>();
        expectTypeOf(defineSimpleAgent).returns.toEqualTypeOf<SimpleAgent>();
        expectTypeOf(defineModelAgent).parameter(0).toEqualTypeOf<ModelAgentDefinition>();

        const read = (agent: Agent) => {
            if (agent.kind === 'simple') {
                expectTypeOf(agent).toEqualTypeOf<SimpleAgent>();
                expectTypeOf(agent.definition.run).toEqualTypeOf<SimpleAgentDefinition['run']>();

                return undefined;
            }

            expectTypeOf(agent).toEqualTypeOf<ModelAgent>();
            expectTypeOf(agent.definition.instructions).toEqualTypeOf<ModelAgentDefinition['instructions']>();

            return agent.definition.instructions;
        };

        expect(read(defineSimpleAgent({ name: 'fan', run }))).toBeUndefined();
    });

    it('infers declared tool outputs and accepts raw inputs while retaining dynamic lookup', async () => {
        const tools = {
            double: tool({ inputSchema: z.object({ value: z.number() }), execute: async ({ value }) => value * 2 }),
            transformed: tool({ inputSchema: z.object({ value: z.string().transform(Number) }), execute: async ({ value }) => value * 2 }),
            count: tool({
                inputSchema: z.object({}),
                async* execute() {
                    yield 1; yield 2;
                },
            }),
        };
        const typed = defineSimpleAgent({
            name: 'typed',
            tools,
            state: { totals: z.object({ value: z.number() }) },
            run: async (_, ctx) => {
                const value = await ctx.tools.double({ value: 21 });
                const count = await ctx.tools.count({});
                const transformed = await ctx.tools.transformed({ value: '21' });

                expectTypeOf(value).toEqualTypeOf<number>();
                expectTypeOf(count).toEqualTypeOf<number>();
                expectTypeOf(transformed).toEqualTypeOf<number>();
                expectTypeOf(ctx.state.collection('totals').upsert).parameter(1).toEqualTypeOf<{ value: number }>();
                expectTypeOf(ctx.tools.dynamic!).returns.toEqualTypeOf<Promise<unknown>>();

                expectTypeOf(ctx.tools.double).parameter(0).toEqualTypeOf<unknown>();

                return {
                    value,
                    count,
                    transformed,
                };
            },
        });

        expectTypeOf(typed.definition.tools).toEqualTypeOf<typeof tools | undefined>();

        const store = createMemoryStore();
        const engine = new Engine({ store, agents: [typed] });

        try {
            await engine.start();

            const { runId } = await engine.dispatch({
                agent: 'typed',
                trigger: 'test',
                channel: 'test',
                payload: {},
            });

            await engine.idle();
            expect((await store.runs.findOne(runId))?.output).toEqual({
                value: 42,
                count: 2,
                transformed: 42,
            });
        } finally {
            await engine.stop();
        }
    });

    it('types the union', () => {
        expectTypeOf<AgentDefinition>().toEqualTypeOf<ModelAgentDefinition | SimpleAgentDefinition>();
        expectTypeOf<SimpleAgentDefinition['model']>().toEqualTypeOf<undefined>();
        expectTypeOf<ModelAgentDefinition['run']>().toEqualTypeOf<undefined>();
        expectTypeOf<SimpleRunContext>().toMatchTypeOf<ToolContext>();
        expectTypeOf<SimpleRunContext['tools']>().toEqualTypeOf<Record<string, (input: unknown) => Promise<unknown>>>();
    });
});
