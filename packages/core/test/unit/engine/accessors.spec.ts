/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModel } from 'ai';
import { describe, expect, it } from 'vitest';
import { defineModelAgent, systemClock } from '@chamvi/core';
import { ControllableClock } from '../../utils/clock.ts';
import { createTestEngine, createTestServices } from '../../utils/engine.ts';

const model = {} as LanguageModel;
const triage = defineModelAgent({
    name: 'triage',
    model,
    instructions: 'x',
});
const digest = defineModelAgent({
    name: 'digest',
    model,
    instructions: 'x',
});

describe('engine accessors', () => {
    it('exposes the services and clock it was built with', () => {
        const clock = new ControllableClock();
        const services = createTestServices({ clock });
        const engine = createTestEngine({
            services,
            agents: [triage],
            clock,
        });

        for (const name of Object.keys(services) as (keyof typeof services)[]) {
            expect(engine[name], name).toBe(services[name]);
        }

        expect(engine.clock).toBe(clock);
    });

    it('defaults the clock to systemClock', () => {
        const engine = createTestEngine({
            services: createTestServices(),
            agents: [],
        });

        expect(engine.clock).toBe(systemClock);
    });

    it('lists its agents in registration order', () => {
        const engine = createTestEngine({
            services: createTestServices(),
            agents: [triage, digest],
        });

        expect(engine.listAgents()).toEqual([triage, digest]);
        expect(engine.listAgents()[0]).toBe(triage);
    });

    it('returns a fresh array from listAgents', () => {
        const engine = createTestEngine({
            services: createTestServices(),
            agents: [triage],
        });
        const agents = engine.listAgents();

        agents.push(digest);
        expect(engine.listAgents()).toEqual([triage]);
        expect(engine.getAgent('digest')).toBeUndefined();
    });

    it('looks an agent up by name', () => {
        const engine = createTestEngine({
            services: createTestServices(),
            agents: [triage, digest],
        });

        expect(engine.getAgent('digest')).toBe(digest);
        expect(engine.getAgent('unknown')).toBeUndefined();
    });
});
