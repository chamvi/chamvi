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
    defineAgent,
    isCodeAgent,
} from '@chamvi/core';
import type {
    AgentDefinition,
    CodeAgentDefinition,
    CodeRunContext,
    ModelAgentDefinition,
    ToolContext,
} from '@chamvi/core';
import { EngineSkills } from '../../../src/engine/skills/module.ts';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { EMPTY_SKILL_CONTRIBUTION } from '../../../src/skill/constants.ts';
import { fakeSkillRuntime } from '../../utils/skill-runtime.ts';

const run = () => 'ok';

describe('code agents', () => {
    it('defines an agent with run and no model', () => {
        const fan = defineAgent({
            name: 'fan', 
            run, 
            description: 'Fans out.', 
        });

        expect(fan.definition.run).toBe(run);
        expect(fan.definition.description).toBe('Fans out.');
        expect(fan.definition.budget.timeoutMs).toBeGreaterThan(0);
        expect(isCodeAgent(fan)).toBe(true);
        expect(isCodeAgent(fan.definition)).toBe(true);
    });

    it('tells a model agent apart', () => {
        const model = defineAgent({
            name: 'm', 
            model: {} as LanguageModel, 
            instructions: 'x', 
        });

        expect(isCodeAgent(model)).toBe(false);
        expect(isCodeAgent(model.definition)).toBe(false);
    });

    it('registers on an engine without a default model', async () => {
        const fan = defineAgent({ name: 'fan', run });
        const engine = new Engine({ store: createMemoryStore(), agents: [fan] });

        expect(() => engine.checkAgent(fan)).not.toThrow();
        await expect(engine.putAgent(defineAgent({ name: 'other', run }))).resolves.toBeDefined();
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
        const fan = defineAgent({ name: 'fan', run });

        skills.checkAgent(fan);
        await skills.prepare([fan], { signal: new AbortController().signal });

        expect(skills.get(fan)).toBe(EMPTY_SKILL_CONTRIBUTION);
        expect(global.calls.checks).toBe(0);
    });

    it('keeps dispatch role subscriptions', () => {
        const fan = defineAgent({
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
        } as unknown as AgentDefinition;

        expect(() => defineAgent(def)).toThrow(InvalidAgentDefinitionError);
        expect(() => defineAgent(def)).toThrow(new RegExp(`"${field}"`));
    });

    it('refuses a tools factory', () => {
        const def = {
            name: 'fan', 
            run, 
            tools: () => ({}), 
        } as unknown as AgentDefinition;

        expect(() => defineAgent(def)).toThrow(InvalidAgentDefinitionError);
        expect(() => defineAgent(def)).toThrow(/"tools"/);
    });

    it('refuses a run that is not a function', () => {
        const def = { name: 'fan', run: 'x' } as unknown as AgentDefinition;

        expect(() => defineAgent(def)).toThrow(InvalidAgentDefinitionError);
        expect(() => defineAgent(def)).toThrow(/"run"/);
    });

    it('refuses an empty description', () => {
        expect(() => defineAgent({
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

        expect(() => defineAgent({
            name: 'fan', 
            run, 
            tools, 
        })).toThrow(/needsApproval/);
    });

    it('types the union', () => {
        expectTypeOf<AgentDefinition>().toEqualTypeOf<ModelAgentDefinition | CodeAgentDefinition>();
        expectTypeOf<CodeAgentDefinition['model']>().toEqualTypeOf<undefined>();
        expectTypeOf<ModelAgentDefinition['run']>().toEqualTypeOf<undefined>();
        expectTypeOf<CodeRunContext>().toMatchTypeOf<ToolContext>();
        expectTypeOf<CodeRunContext['tools']>().toEqualTypeOf<Record<string, (input: unknown) => Promise<unknown>>>();
    });
});
