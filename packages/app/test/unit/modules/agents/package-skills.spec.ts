/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { join } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { POLL_MS, buildAgentsDirHarness } from '../../../utils/agents-dir.ts';
import { createTempDir, writeTree } from '../../../utils/folder.ts';
import type { Harness } from '../../../utils/harness.ts';
import { installPackage } from '../../../utils/packages.ts';

let tmp: Awaited<ReturnType<typeof createTempDir>>;
let cwd: string;
const harnesses: Harness[] = [];

beforeEach(async () => {
    tmp = await createTempDir();
    cwd = join(tmp.path, 'app');
    await writeTree(cwd, { 'package.json': '{ "name": "app", "private": true }\n' });
    await installPackage(cwd, 'skilled', { agents: ['skilled'] });
    await installPackage(cwd, 'plain', { agents: ['plain'] });
});

afterEach(async () => {
    await Promise.all(harnesses.map((harness) => harness.stop()));
    harnesses.length = 0;
    await tmp.remove();
});

/** The `skilled` package's agent prepares skills through `prepare`; `plain` loads natively. */
function build(prepare: () => Promise<void>, options: { mode?: 'start' | 'job'; job?: { agent: string } } = {}) {
    // prepares only the agents holding this input (a shared fake runtime would fail every preparation)
    const input = {
        prepare,
        runtime: {
            protocol: 'test/runtime-v1',
            snapshot: (inputs: readonly unknown[]) => inputs,
            create: () => ({
                checkAgent() {},
                async prepare(agents: readonly { definition: { skills?: readonly { prepare?: () => Promise<void> }[] } }[]) {
                    for (const agent of agents) {
                        for (const skill of agent.definition.skills ?? []) {
                            await skill.prepare?.();
                        }
                    }

                    return {
                        commit: () => agents.map((agent) => ({
                            agent,
                            contribution: Object.freeze({
                                instructions: '',
                                tools: {},
                                checkTools() {},
                            }),
                        })),
                    };
                },
            }),
        },
    };
    const skills = [input];
    const setup = buildAgentsDirHarness({
        cwd,
        packages: ['skilled', 'plain'],
        ...options,
        importer: async (url) => {
            if (url.includes('/skilled/')) {
                return {
                    default: {
                        name: 'skilled',
                        definition: {
                            model: 'test/model',
                            instructions: 'x',
                            skills,
                        },
                    },
                };
            }

            return import(/* @vite-ignore */ url);
        },
    });

    harnesses.push(setup.harness);

    return setup;
}

describe('package agent skill preparation', () => {
    it('is an issue at boot, the others start, and retries with capped backoff until it succeeds', async () => {
        let attempts = 0;
        let ready = false;
        const setup = build(async () => {
            attempts++;

            if (!ready) {
                throw new Error('skill source unavailable');
            }
        });

        await setup.harness.setup();

        expect(attempts).toBe(1);
        expect(setup.engine().getAgent('plain')).toBeDefined();
        expect(setup.engine().getAgent('skilled')).toBeUndefined();
        expect(await setup.store.agentRevisions.findOne('skilled')).toBeUndefined();
        expect(setup.issues()).toEqual([expect.objectContaining({
            agent: 'skilled',
            message: 'skilled (skilled): skill source unavailable',
        })]);

        await setup.watch();
        // the first retry is due 2 polls after the failure, the next 4 polls after that
        await setup.poll();
        expect(attempts).toBe(1);
        await setup.poll();
        expect(attempts).toBe(2);

        for (let i = 0; i < 3; i++) {
            await setup.poll();
        }

        expect(attempts).toBe(2);
        await setup.poll();
        expect(attempts).toBe(3);

        ready = true;

        for (let i = 0; i < 8; i++) {
            await setup.poll();
        }

        expect(attempts).toBe(4);
        expect(setup.engine().getAgent('skilled')).toBeDefined();
        expect((await setup.store.agentRevisions.findOne('skilled'))?.hash).toBe('skilled@1.0.0');
        expect(setup.issues()).toEqual([]);

        await setup.poll();
        expect(attempts).toBe(4);
    });

    it('stops retrying once stopped', async () => {
        let attempts = 0;
        const setup = build(async () => {
            attempts++;

            throw new Error('down');
        });

        await setup.harness.setup();
        await setup.watch();
        await setup.harness.stop();
        setup.clock.advance(POLL_MS * 10);
        expect(attempts).toBe(1);
    });

    it('fails the job of that agent with package_agent_failed', async () => {
        const setup = build(async () => {
            throw new Error('down');
        }, { mode: 'job', job: { agent: 'skilled' } });

        await expect(setup.harness.setup()).rejects.toMatchObject({
            code: 'package_agent_failed',
            message: 'skilled (skilled): down',
        });
    });
});
