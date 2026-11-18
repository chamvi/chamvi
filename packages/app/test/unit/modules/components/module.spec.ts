/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    ErrorCode,
    InvalidAgentDefinitionError,
    defineModelAgent,
    defineTool,
} from '@chamvi/core';
import { http } from '@chamvi/http';
import { ControllableClock, mockModel, textModel } from '@chamvi/test-kit';
import { jsonSchema } from 'ai';
import type { IComponent } from 'hubwire';
import type { IModule } from 'orkos';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    APP_ERROR_CODE,
    AppToken,
    ModuleName,
    componentsModule,
    configModule,
    createApp,
    runHooks,
} from '@chamvi/app';
import type { AppComponent, AppMode, IApp } from '@chamvi/app';
import {
    TOKEN,
    TOKENS,
    deferred,
    rejectionOf,
} from '../../../utils/app.ts';
import { createHarness } from '../../../utils/harness.ts';
import type { Harness } from '../../../utils/harness.ts';
import { createRecordingLogger } from '../../../utils/logger.ts';
import { freePort } from '../../../utils/port.ts';

const DRAIN_TIMEOUT_MS = 1_000;

type FakeOptions = {
    start?: () => Promise<void>;
    stop?: () => Promise<void>;
    settled?: () => Promise<void>;
};

/** A component recording `<name> start`, `<name> stop` and `<name> settled` into `events`. */
function fake(name: string, events: string[], options: FakeOptions = {}): AppComponent {
    const component: IComponent = {
        async start() {
            events.push(`${name} start`);
            await options.start?.();
        },
        async stop() {
            events.push(`${name} stop`);
            await options.stop?.();
        },
        async settled() {
            events.push(`${name} settled`);
            await options.settled?.();
        },
        status: () => ({ lastRunAt: 1 }),
    };

    return { name, component };
}

/** A module contributing `components` in `setup`, recording `<name> setup`. */
function contributing(name: string, components: AppComponent[], events: string[] = []): IModule {
    return {
        name,
        async setup(container) {
            events.push(`${name} setup`);

            for (const component of components) {
                container.registerMany(AppToken.COMPONENTS, { useValue: component });
            }
        },
    };
}

function flush(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

/** Resolves whether `promise` settled within a few event loop turns. */
async function settledSoon(promise: Promise<unknown>): Promise<boolean> {
    let done = false;

    promise.then(() => {
        done = true; 
    }, () => {
        done = true; 
    });

    for (let i = 0; i < 5; i++) {
        await flush();
    }

    return done;
}

let harnesses: Harness[] = [];
let apps: IApp[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((harness) => harness.stop().catch(() => {})));
    await Promise.all(apps.map((app) => app.stop().catch(() => {})));
    harnesses = [];
    apps = [];
});

async function setup(modules: IModule[], options: {
    mode?: AppMode; 
    check?: boolean; 
    env?: Record<string, string> 
} = {}) {
    const clock = new ControllableClock();
    const logger = createRecordingLogger(clock);
    const harness = await createHarness({
        mode: options.mode,
        check: options.check,
        env: { CHAMVI_DRAIN_TIMEOUT_MS: String(DRAIN_TIMEOUT_MS), ...options.env },
        modules: [configModule({ clock, logger }), componentsModule(), ...modules],
    });

    harnesses.push(harness);

    return {
        harness, 
        clock, 
        logger, 
    };
}

describe('componentsModule', () => {
    it('starts the components in registration order once every module set up', async () => {
        const events: string[] = [];

        const { harness } = await setup([
            contributing('first', [fake('alpha', events)], events),
            contributing('second', [fake('beta', events), fake('gamma', events)], events),
        ]);

        expect(events).toEqual(['first setup', 'second setup', 'alpha start', 'beta start', 'gamma start']);

        const list = harness.container.resolve(AppToken.COMPONENT_LIST);

        expect(list.map((entry) => entry.name)).toEqual(['alpha', 'beta', 'gamma']);
        expect(list.map((entry) => entry.component.status())).toEqual([{ lastRunAt: 1 }, { lastRunAt: 1 }, { lastRunAt: 1 }]);
    });

    it('stops every component on stopping, then awaits each settled()', async () => {
        const events: string[] = [];
        const settle = deferred();

        const { harness } = await setup([contributing('jobs', [
            fake('alpha', events, { settled: () => settle.promise }),
            fake('beta', events),
        ])]);

        events.length = 0;

        const stopping = runHooks(harness.container, 'stopping');

        expect(await settledSoon(stopping)).toBe(false);
        expect(events.slice(0, 2).sort()).toEqual(['alpha stop', 'beta stop']);
        expect(events.slice(2).sort()).toEqual(['alpha settled', 'beta settled']);

        settle.resolve();
        await stopping;
        expect(harness.reported).toEqual([]);
    });

    it('stops in teardown what is still running, once', async () => {
        const events: string[] = [];

        const { harness } = await setup([contributing('jobs', [fake('alpha', events)])]);

        events.length = 0;
        await harness.stop();
        expect(events).toEqual(['alpha stop', 'alpha settled']);

        await harness.application.teardown();
        expect(events).toEqual(['alpha stop', 'alpha settled']);
    });

    it('does not stop again in teardown after the stopping hook', async () => {
        const events: string[] = [];

        const { harness } = await setup([contributing('jobs', [fake('alpha', events)])]);

        events.length = 0;
        await runHooks(harness.container, 'stopping');
        await harness.stop();
        expect(events).toEqual(['alpha stop', 'alpha settled']);
    });

    it('fails the start with the error of a failing start() and stops the started ones', async () => {
        const events: string[] = [];
        const failure = new Error('cannot start');
        const clock = new ControllableClock();

        const error = await rejectionOf(createHarness({
            env: { CHAMVI_DRAIN_TIMEOUT_MS: String(DRAIN_TIMEOUT_MS) },
            modules: [
                configModule({ clock, logger: createRecordingLogger(clock) }),
                componentsModule(),
                contributing('jobs', [
                    fake('alpha', events),
                    fake('beta', events, { start: () => Promise.reject(failure) }),
                    fake('gamma', events),
                ]),
            ],
        }));

        expect(error).toBe(failure);
        expect(events).toContain('alpha stop');
        expect(events).toContain('alpha settled');
        expect(events).not.toContain('gamma start');
    });

    it.each([
        ['a check', { check: true }],
        ['job mode', { mode: 'job' as const }],
        // no store module: the URL is read, never connected to
        ['migrate mode', { mode: 'migrate' as const, env: { DATABASE_URL: 'postgres://chamvi@127.0.0.1:1/chamvi' } }],
    ])('neither resolves nor starts the components in %s', async (_label, options) => {
        const events: string[] = [];
        const contributor: IModule = {
            name: 'jobs',
            async setup(container) {
                container.registerMany(AppToken.COMPONENTS, {
                    useFactory: () => {
                        events.push('resolved');

                        return fake('alpha', events);
                    },
                });
            },
        };

        const { harness } = await setup([contributor], options);

        expect(events).toEqual([]);
        expect(harness.container.has(AppToken.COMPONENT_LIST)).toBe(false);

        await harness.stop();
        expect(events).toEqual([]);
    });

    it.each([
        ['a duplicate name', [fake('alpha', []), fake('alpha', [])], 'Two modules contribute the component "alpha".'],
        ['a name that is not kebab-case', [fake('Alpha_Job', [])], 'The component name "Alpha_Job" is not lower-kebab'],
        ['a name longer than 64 characters', [fake('a'.repeat(65), [])], 'is not lower-kebab'],
        ['an entry without a component', [{ name: 'alpha', component: {} } as AppComponent], 'The component "alpha" has no start(), stop() and status().'],
    ])('refuses %s', async (_label, components, message) => {
        const clock = new ControllableClock();

        const error = await rejectionOf(createHarness({
            modules: [
                configModule({ clock, logger: createRecordingLogger(clock) }),
                componentsModule(),
                contributing('jobs', components),
            ],
        }));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toContain(message);
    });

    describe('a component that never stops', () => {
        // hubwire calls every stop() before awaiting any, and settled() once all stop() calls resolved
        it.each([
            ['stop()', { stop: () => new Promise<void>(() => {}) }, ['alpha stop', 'gamma stop', 'stuck stop']],
            ['settled()', { settled: () => new Promise<void>(() => {}) }, ['alpha stop', 'gamma stop', 'stuck stop', 'alpha settled', 'gamma settled', 'stuck settled']],
        ])('whose %s hangs does not keep the others from stopping, and the stop ends at the drain timeout', async (_label, hang, expected) => {
            const events: string[] = [];

            const { harness, clock } = await setup([contributing('jobs', [
                fake('alpha', events),
                fake('stuck', events, hang),
                fake('gamma', events),
            ])]);

            events.length = 0;

            const stopping = runHooks(harness.container, 'stopping');

            expect(await settledSoon(stopping)).toBe(false);
            expect([...events].sort()).toEqual([...expected].sort());

            clock.advance(DRAIN_TIMEOUT_MS - 1);
            expect(await settledSoon(stopping)).toBe(false);

            clock.advance(1);
            expect(await settledSoon(stopping)).toBe(true);

            expect(harness.reported).toHaveLength(1);
            expect(harness.reported[0]!.error).toMatchObject({ code: ErrorCode.TIMEOUT });
            expect(harness.reported[0]!.context).toEqual({ module: ModuleName.COMPONENTS });

            // the teardown does not wait a second time
            expect(await settledSoon(harness.stop())).toBe(true);
        });

        it('serves the list of the components module at GET /components, the jobs before the channels with a status', async () => {
            const clock = new ControllableClock(new Date('2026-11-18T00:00:00Z'));
            const port = await freePort();
            const app = createApp({
                agents: [defineModelAgent({
                    name: 'triage',
                    model: textModel(),
                    instructions: 'x',
                    channels: [http.on()],
                })],
                modules: [
                    configModule({ clock, logger: createRecordingLogger(clock) }),
                    contributing('jobs', [fake('alpha', []), fake('beta', [])]),
                ],
            });

            apps.push(app);
            await app.start({
                env: {
                    HOST: '127.0.0.1',
                    PORT: String(port),
                    CHAMVI_TOKENS: TOKENS,
                    CHAMVI_READINESS_DELAY_MS: '0',
                    CHAMVI_DRAIN_TIMEOUT_MS: String(DRAIN_TIMEOUT_MS),
                    // the server close adds nothing: only the components and the drain count
                    CHAMVI_CLOSE_TIMEOUT_MS: '0',
                },
            });

            const response = await fetch(`http://127.0.0.1:${port}/components`, { headers: { authorization: `Bearer ${TOKEN}` } });

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                data: [
                    {
                        name: 'alpha',
                        kind: 'job',
                        lastRunAt: '1970-01-01T00:00:00.001Z',
                    },
                    {
                        name: 'beta',
                        kind: 'job',
                        lastRunAt: '1970-01-01T00:00:00.001Z',
                    },
                    // the store module's purge, before its first pass
                    { name: 'store-purge', kind: 'job' },
                    // the scheduler module's cron channel, before its first tick
                    { name: 'cron', kind: 'channel' },
                ],
            });
        });

        it('ends the app shutdown within the drain timeout', async () => {
            const events: string[] = [];
            const clock = new ControllableClock(new Date('2026-11-18T00:00:00Z'));
            const port = await freePort();
            const app = createApp({
                agents: [defineModelAgent({
                    name: 'triage',
                    model: textModel(),
                    instructions: 'x',
                    channels: [http.on()],
                })],
                modules: [
                    configModule({ clock, logger: createRecordingLogger(clock) }),
                    contributing('jobs', [fake('alpha', events), fake('stuck', events, { stop: () => new Promise<void>(() => {}) })]),
                ],
            });

            apps.push(app);
            await app.start({
                env: {
                    HOST: '127.0.0.1',
                    PORT: String(port),
                    CHAMVI_TOKENS: TOKENS,
                    CHAMVI_READINESS_DELAY_MS: '0',
                    CHAMVI_DRAIN_TIMEOUT_MS: String(DRAIN_TIMEOUT_MS),
                },
            });
            expect(events).toEqual(['alpha start', 'stuck start']);

            const stopped = rejectionOf(app.stop());

            expect(await settledSoon(stopped)).toBe(false);
            expect([...events].sort()).toEqual(['alpha start', 'alpha stop', 'stuck start', 'stuck stop']);

            clock.advance(DRAIN_TIMEOUT_MS);

            const error = await stopped;

            expect(error.code).toBe(APP_ERROR_CODE.STOP_FAILED);
        });

        it('shares one drain budget with the engine drain: an in-flight run gets only what the components left', async () => {
            const events: string[] = [];
            const clock = new ControllableClock(new Date('2026-11-18T00:00:00Z'));
            const port = await freePort();
            const running = deferred();
            // a tool that runs until the drain aborts it
            const wait = defineTool({
                inputSchema: jsonSchema<Record<string, never>>({ type: 'object', properties: {} }),
                execute: (_input, { abortSignal }) => new Promise<string>((_resolve, reject) => {
                    running.resolve();
                    abortSignal?.addEventListener('abort', () => reject(abortSignal.reason));
                }),
            });
            const app = createApp({
                agents: [defineModelAgent({
                    name: 'triage',
                    model: mockModel([{
                        parts: [{
                            type: 'tool-call',
                            toolName: 'wait',
                            input: {},
                        }],
                    }]),
                    instructions: 'x',
                    tools: { wait },
                    channels: [http.on()],
                })],
                modules: [
                    configModule({ clock, logger: createRecordingLogger(clock) }),
                    contributing('jobs', [fake('stuck', events, { stop: () => new Promise<void>(() => {}) })]),
                ],
            });

            apps.push(app);
            await app.start({
                env: {
                    HOST: '127.0.0.1',
                    PORT: String(port),
                    CHAMVI_TOKENS: TOKENS,
                    CHAMVI_READINESS_DELAY_MS: '0',
                    CHAMVI_DRAIN_TIMEOUT_MS: String(DRAIN_TIMEOUT_MS),
                    // the server close adds nothing: only the components and the drain count
                    CHAMVI_CLOSE_TIMEOUT_MS: '0',
                },
            });

            const response = await fetch(`http://127.0.0.1:${port}/agents/triage/runs`, {
                method: 'POST',
                headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', connection: 'close' },
                body: JSON.stringify({ input: 'go' }),
            });

            expect(response.status).toBe(202);
            await running.promise;

            const stopped = rejectionOf(app.stop());

            /** Fires what is due now (a timer of 0 ms) and lets the shutdown go on, several rounds. */
            const settledNow = async () => {
                let done = false;

                stopped.then(() => {
                    done = true;
                }, () => {});

                for (let i = 0; i < 50 && !done; i++) {
                    clock.advance(0);
                    await flush();
                }

                return done;
            };

            // the components' stop holds the shutdown for the whole budget
            expect(await settledNow()).toBe(false);
            clock.advance(DRAIN_TIMEOUT_MS - 1);
            expect(await settledNow()).toBe(false);

            // the budget ends: the drain has none left, so it interrupts the run at once instead of waiting a second timeout
            clock.advance(1);
            expect(await settledNow()).toBe(true);
            expect((await stopped).code).toBe(APP_ERROR_CODE.STOP_FAILED);
        });
    });
});
