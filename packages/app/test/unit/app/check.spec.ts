/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineModelAgent } from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import type { Run } from '@chamvi/store';
import { http } from '@chamvi/http';
import { ControllableClock, textModel } from '@chamvi/test-kit';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    APP_ERROR_CODE,
    AppToken,
    configModule,
    createApp,
} from '@chamvi/app';
import type { AppCheckResult, IApp, IModule } from '@chamvi/app';
import { isSchemaBehindError } from '../../../src/module/helpers/index.ts';
import {
    agentFile,
    provider,
    queueRun,
} from '../../utils/agents-dir.ts';
import { TOKENS, rejectionOf } from '../../utils/app.ts';
import { createTempDir, writeTree } from '../../utils/folder.ts';
import { createRecordingLogger } from '../../utils/logger.ts';
import { closeServer, freePort, listenOn } from '../../utils/port.ts';
import { createTestStore, storeModuleOf } from '../../utils/store.ts';
import type { TestStore } from '../../utils/store.ts';

const START = new Date('2026-10-26T00:00:00Z');

let apps: IApp[] = [];
let dir: { path: string; remove: () => Promise<void> };

beforeEach(async () => {
    dir = await createTempDir();
});

afterEach(async () => {
    await Promise.all(apps.map((app) => app.stop().catch(() => {})));
    apps = [];
    await dir.remove();
});

/** A store that records every call that may write (any method not named find* or read*). */
function recordingRepository(store: TestStore): { store: TestStore; writes: string[] } {
    const writes: string[] = [];
    const record = <T extends object>(target: T): T => new Proxy(target, {
        get(valueTarget, key, receiver) {
            const value: unknown = Reflect.get(valueTarget, key, receiver);

            if (typeof value !== 'function' || typeof key !== 'string') {
                return value;
            }

            return (...args: unknown[]) => {
                if (!/^(find|read)/.test(key)) {
                    writes.push(key);
                }

                return (value as (...a: unknown[]) => unknown).apply(valueTarget, args);
            };
        },
    });

    return {
        store: {
            // the repositories the app builds its run and step services on
            runRepository: record(store.runRepository),
            stepRepository: record(store.stepRepository),
            runService: store.runService,
            stepService: store.stepService,
            checkpoints: record(store.checkpointService),
            lockRepository: record(store.lockRepository),
            idempotencyRepository: record(store.idempotencyRepository),
            effects: record(store.effectService),
            state: record(store.stateService),
            artifacts: record(store.artifactService),
            agentRevisionRepository: record(store.agentRevisionRepository),
            conversationRepository: record(store.conversationRepository),
        } as unknown as TestStore,
        writes,
    };
}

function build(options: {
    agents?: Agent[];
    store?: TestStore;
    clock?: ControllableClock;
    modules?: IModule[];
} = {}) {
    const clock = options.clock ?? new ControllableClock(START);
    const logger = createRecordingLogger(clock);
    const store = options.store ?? createTestStore({ clock });
    const app = createApp({
        agents: options.agents ?? [],
        models: { test: provider() },
        modules: [configModule({ clock, logger }), storeModuleOf(store), ...options.modules ?? []],
    });

    apps.push(app);

    return {
        app,
        clock,
        logger,
        store,
    };
}

async function envFor(extra: Record<string, string> = {}) {
    const port = await freePort();

    return {
        port,
        env: {
            HOST: '127.0.0.1',
            PORT: String(port),
            CHAMVI_TOKENS: TOKENS,
            ...extra,
        },
    };
}

const triage = defineModelAgent({
    name: 'triage',
    model: textModel(),
    instructions: 'x',
    channels: [http.on()],
});

/** A run of `agent` parked on an approval. */
async function parkWaiting(store: TestStore, clock: ControllableClock, id: string, agent: string): Promise<void> {
    const now = new Date(clock.now());
    const run: Run = {
        id,
        agent,
        status: 'waiting',
        trigger: {
            id: `t-${id}`,
            agent,
            trigger: 'http',
            channel: 'http',
            payload: {},
            receivedAt: now,
        },
        waiting: {
            kind: 'approval',
            id: 'a1',
            approvalId: 'a1',
            toolName: 'tool',
            toolCallId: 'c1',
            title: 'Run tool?',
            expiresAt: new Date(now.getTime() + 60_000),
        },
        usage: { inputTokens: 0, outputTokens: 0 },
        createdAt: now,
        updatedAt: now,
    };

    await store.runService.create(run);
}

describe('App.check', () => {
    it('resolves no issues for a clean app and starts nothing', async () => {
        const clock = new ControllableClock(START);
        const store = createTestStore({ clock });
        const runId = await queueRun(store, clock, 'triage');
        const { app } = build({
            agents: [triage],
            store,
            clock,
        });
        const { port, env } = await envFor();

        await expect(app.check({ env })).resolves.toEqual({ issues: [] } satisfies AppCheckResult);

        const server = await listenOn(port);

        await closeServer(server);
        expect((await store.runService.findOne(runId))?.status).toBe('queued');
    });

    it('writes nothing to the store', async () => {
        const clock = new ControllableClock(START);
        const memory = createTestStore({ clock });

        await writeTree(dir.path, { 'triage/agent.ts': agentFile('v2', 'test/model', 'triage') });

        const stale = {
            agent: 'triage',
            hash: 'c'.repeat(64),
            changedAt: START,
        };
        const orphan = {
            agent: 'gone',
            hash: 'd'.repeat(64),
            changedAt: START,
        };

        await memory.agentRevisionService.save(stale);
        await memory.agentRevisionService.save(orphan);

        const queued = await queueRun(memory, clock, 'triage');

        await parkWaiting(memory, clock, 'waiting-run', 'triage');

        const { store, writes } = recordingRepository(memory);
        const { app } = build({ store, clock });
        const { env } = await envFor({ CHAMVI_AGENTS_DIR: dir.path });

        await expect(app.check({ env })).resolves.toEqual({ issues: [] });

        expect(writes).toEqual([]);
        expect((await memory.runService.findOne(queued))?.status).toBe('queued');
        expect((await memory.runService.findOne('waiting-run'))?.status).toBe('waiting');
        expect(await memory.agentRevisionService.findOne('triage')).toEqual(stale);
        expect(await memory.agentRevisionService.findOne('gone')).toEqual(orphan);
    });

    it('reports a broken folder as an issue', async () => {
        await writeTree(dir.path, { 'triage/agent.ts': 'export default 42;\n' });

        const { app } = build();
        const { env } = await envFor({ CHAMVI_AGENTS_DIR: dir.path });

        const { issues } = await app.check({ env });

        expect(issues).toHaveLength(1);
        expect(issues[0]?.message).toMatch(/^triage\/agent\.ts: /);
    });

    it('reports a folder subscribing to a channel no module contributes', async () => {
        await writeTree(dir.path, { 'triage/agent.ts': agentFile('v1', 'test/model', 'triage', ['{ channel: \'github\', id: \'github:issues\', options: {} }']) });

        const { app } = build();
        const { env } = await envFor({ CHAMVI_AGENTS_DIR: dir.path });

        const { issues } = await app.check({ env });

        expect(issues).toHaveLength(1);
        expect(issues[0]?.message).toContain('unknown channel "github".');
    });

    it('rejects an agent passed in code on an unknown channel with invalid_agent_definition', async () => {
        const lonely = defineModelAgent({
            name: 'lonely',
            model: textModel(),
            instructions: 'x',
            channels: [{
                channel: 'github',
                id: 'github:issues',
                options: {},
            }],
        });
        const { app } = build({ agents: [lonely] });
        const { env } = await envFor();

        const error = await rejectionOf(app.check({ env }));

        expect(error.code).toBe('invalid_agent_definition');
    });

    it('rejects an agent passed in code with a cron subscription croner refuses, as start does', async () => {
        const nightly = defineModelAgent({
            name: 'nightly',
            model: textModel(),
            instructions: 'x',
            channels: [{
                channel: 'cron',
                id: 'cron:0 0 * * 1/2',
                options: { expression: '0 0 * * 1/2', overlap: 'skip' },
            }],
        });
        const { app } = build({ agents: [nightly] });
        const { env } = await envFor();

        const error = await rejectionOf(app.check({ env }));

        expect(error.code).toBe('invalid_agent_definition');
        expect(error.message).toContain('0 0 * * 1/2');
    });

    it('rejects without CHAMVI_TOKENS outside dev', async () => {
        const { app } = build({ agents: [triage] });
        const { env } = await envFor();

        delete (env as Record<string, string | undefined>).CHAMVI_TOKENS;

        const error = await rejectionOf(app.check({ env }));

        expect(error.code).toBe('invalid_agent_definition');
        expect(error.message).toContain('No authenticator');
    });

    it('rejects a missing provider key', async () => {
        const keyless = defineModelAgent({
            name: 'keyless',
            model: 'anthropic/claude-x',
            instructions: 'x',
            channels: [http.on()],
        });
        const { app } = build({ agents: [keyless] });
        const { env } = await envFor();

        const error = await rejectionOf(app.check({ env }));

        expect(error.code).toBe('invalid_agent_definition');
    });

    it('recognizes only a missing table or column as a behind schema', () => {
        expect(isSchemaBehindError({ driverError: { code: '42P01' } })).toBe(true);
        expect(isSchemaBehindError({ code: '42703' })).toBe(true);
        expect(isSchemaBehindError({ driverError: { code: '23505' } })).toBe(false);
        expect(isSchemaBehindError(new Error('boom'))).toBe(false);
        expect(isSchemaBehindError('42P01')).toBe(false);
    });

    it('reports an incomplete connection as an issue, a not configured one not', async () => {
        const resolved = (state: 'incomplete' | 'not_configured', missing: string[]) => ({
            name: state === 'incomplete' ? 'mail-home' : 'mail-idle',
            values: {},
            sources: {},
            missing,
            state,
        });
        const connections: IModule = {
            name: 'connection-types',
            setup: async (container) => {
                container.registerMany(AppToken.CONNECTION_TYPES, {
                    useValue: {
                        definition: {
                            type: 'mail',
                            label: 'Mail',
                            multiple: true,
                            fields: [],
                        },
                        creatable: () => true,
                        connections: () => [
                            {
                                name: 'mail-home',
                                editable: true,
                                deletable: true,
                                resolved: resolved('incomplete', ['password']),
                            },
                            {
                                name: 'mail-idle',
                                editable: true,
                                deletable: true,
                                resolved: resolved('not_configured', []),
                            },
                        ],
                    },
                });
            },
        };
        const { app } = build({ modules: [connections] });
        const { env } = await envFor();

        const { issues } = await app.check({ env });

        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ agent: 'mail-home' });
        expect(issues[0]?.message).toContain('mail-home');
        expect(issues[0]?.message).toContain('password');
    });

    it('reports a failed connection as an issue with its reason', async () => {
        const connections: IModule = {
            name: 'connection-types',
            setup: async (container) => {
                container.registerMany(AppToken.CONNECTION_TYPES, {
                    useValue: {
                        definition: {
                            type: 'mail',
                            label: 'Mail',
                            multiple: true,
                            fields: [],
                        },
                        creatable: () => true,
                        connections: () => [{
                            name: 'mail-old',
                            editable: true,
                            deletable: true,
                            resolved: {
                                name: 'mail-old',
                                values: {},
                                sources: {},
                                missing: [],
                                state: 'failed',
                                reason: 'The stored secrets cannot be read (decryption_failed).',
                            },
                        }],
                    },
                });
            },
        };
        const { app } = build({ modules: [connections] });
        const { env } = await envFor();

        const { issues } = await app.check({ env });

        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ agent: 'mail-old' });
        expect(issues[0]?.message).toContain('mail-old');
        expect(issues[0]?.message).toContain('decryption_failed');
    });

    it('runs the paired engineCreated and drained hooks, never started or stopping', async () => {
        const phases: string[] = [];
        const hooks: IModule = {
            name: 'hooks',
            setup: async (container) => {
                container.registerMany(AppToken.LIFECYCLE_HOOKS, {
                    useValue: {
                        name: 'probe',
                        engineCreated: () => {
                            phases.push('engineCreated');
                        },
                        started: () => {
                            phases.push('started');
                        },
                        stopping: () => {
                            phases.push('stopping');
                        },
                        drained: () => {
                            phases.push('drained');
                        },
                    },
                });
            },
        };
        const { app } = build({ agents: [triage], modules: [hooks] });
        const { env } = await envFor();

        await app.check({ env });
        expect(phases).toEqual(['engineCreated', 'drained']);
    });

    it('does not wait the readiness delay', async () => {
        const { app } = build({ agents: [triage] });
        const { env } = await envFor({ CHAMVI_READINESS_DELAY_MS: '60000' });

        const started = Date.now();

        await app.check({ env });
        expect(Date.now() - started).toBeLessThan(5_000);
    });

    it('is the app\'s one lifecycle', async () => {
        const { app } = build({ agents: [triage] });
        const { env } = await envFor();

        await app.check({ env });

        const error = await rejectionOf(app.start({ env }));

        expect(error.code).toBe(APP_ERROR_CODE.IN_USE);
    });
});
