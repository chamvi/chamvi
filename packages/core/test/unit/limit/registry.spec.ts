/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError, defineModelAgent } from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { mockModel } from '../../utils/mock-model.ts';
import { createTestEngine, createTestServices } from '../../utils/engine.ts';
import type { TestServiceSet, TestServices } from '../../utils/engine.ts';

const model = mockModel([]);
const limited = defineModelAgent({
    name: 'limited',
    model,
    instructions: 'x',
    limits: { search: { max: 1, windowMs: 1_000 } },
});

/** The test services without a limit service. */
function servicesWithoutLimits() {
    const services: Partial<TestServiceSet> = createTestServices();

    delete services.limitService;

    return services as TestServices;
}

describe('limits need the limit service', () => {
    it('the test engine carries a limit service', () => {
        expect(createTestEngine().limitService).toBeDefined();
    });

    it('an engine without a limit service exposes none', () => {
        expect(createTestEngine({ services: servicesWithoutLimits() }).limitService).toBeUndefined();
    });

    it('refuses an agent with limits passed to the constructor of an engine without a limit service', () => {
        expect(() => createTestEngine({ services: servicesWithoutLimits(), agents: [limited] }))
            .toThrow(InvalidAgentDefinitionError);
        expect(() => createTestEngine({ services: servicesWithoutLimits(), agents: [limited] }))
            .toThrow('Agent "limited" declares limits but the engine has no limit service.');
    });

    it('refuses an agent with limits in putAgent() on an engine without a limit service', async () => {
        const engine = createTestEngine({ services: servicesWithoutLimits() });

        await expect(engine.putAgent(limited)).rejects.toThrow('Agent "limited" declares limits but the engine has no limit service.');
        expect(engine.getAgent('limited')).toBeUndefined();
    });

    it('takes an agent with empty limits without a limit service', () => {
        const agent = defineModelAgent({
            name: 'open', 
            model, 
            instructions: 'x', 
            limits: {}, 
        });

        expect(() => createTestEngine({ services: servicesWithoutLimits(), agents: [agent] })).not.toThrow();
    });

    it('takes an agent with limits on an engine with a limit service', async () => {
        expect(() => createTestEngine({ agents: [limited] })).not.toThrow();
        await expect(createTestEngine().putAgent(limited)).resolves.toBe('added');
    });

    it('refuses a hand-built agent with invalid limits', () => {
        const agent = {
            kind: 'model',
            name: 'hand',
            definition: {
                ...limited.definition, 
                name: 'hand', 
                limits: { search: { max: 0, windowMs: 1 } }, 
            },
        } as Agent;

        expect(() => createTestEngine({ agents: [agent] })).toThrow('tool "search"');
    });
});
