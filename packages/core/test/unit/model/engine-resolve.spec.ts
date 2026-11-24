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
import { InvalidAgentDefinitionError, defineModelAgent } from '@chamvi/core';
import type { IEngine, IModelResolver } from '@chamvi/core';
import { ControllableClock } from '../../utils/clock.ts';
import { mockModel } from '../../utils/mock-model.ts';
import { createTestEngine, createTestServices } from '../../utils/engine.ts';
import type { TestEngineOptions } from '../../utils/engine.ts';

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

function mapResolver(models: Record<string, LanguageModel>): IModelResolver {
    return {
        check() {},
        resolve(ref: string) {
            const model = models[ref];

            if (!model) {
                throw new Error(`no model ${ref}`);
            }

            return model;
        },
    };
}

function setup(options: Partial<TestEngineOptions> = {}) {
    const clock = new ControllableClock(new Date(1_000_000));
    const engine = createTestEngine({
        services: createTestServices({ clock }),
        clock,
        onError: () => {},
        ...options,
    });

    engines.push(engine);

    return engine;
}

describe('engine.resolveModel', () => {
    it('returns a LanguageModel object ref as is', () => {
        const own = mockModel([]);
        const engine = setup({ model: mockModel([]) });

        expect(engine.resolveModel(own)).toBe(own);
    });

    it('resolves a model string through EngineOptions.models', () => {
        const target = mockModel([]);
        const engine = setup({ models: mapResolver({ 'p/m': target }) });

        expect(engine.resolveModel('p/m')).toBe(target);
    });

    it('without a ref: the named agent model', () => {
        const own = mockModel([]);
        const engine = setup({
            model: mockModel([]),
            agents: [defineModelAgent({
                name: 'a', 
                instructions: 'A.', 
                model: own, 
            })],
        });

        expect(engine.resolveModel(undefined, 'a')).toBe(own);
    });

    it('without a ref and agent: the engine default', () => {
        const fallback = mockModel([]);
        const engine = setup({ model: fallback });

        expect(engine.resolveModel()).toBe(fallback);
    });

    it('refuses a model string without a resolver', () => {
        const engine = setup({ model: mockModel([]) });

        expect(() => engine.resolveModel('p/m')).toThrow(InvalidAgentDefinitionError);
    });

    it('refuses when no model is set at all', () => {
        const engine = setup();

        expect(() => engine.resolveModel()).toThrow(InvalidAgentDefinitionError);
    });
});
