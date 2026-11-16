/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError, createMemoryStore, defineModelAgent } from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { http } from '@chamvi/http';
import { ControllableClock, textModel } from '@chamvi/test-kit';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    AppToken,
    configModule,
    createApp,
    engineModule,
    httpModule,
    schedulerModule,
    staticTokensModule,
    storeModule,
} from '@chamvi/app';
import type { AppMode, HttpModuleOptions, IApp } from '@chamvi/app';
import { TOKEN, TOKENS, rejectionOf } from '../../../utils/app.ts';
import {
    MemoController,
    NoteController,
    RunsController,
    openApiDocument,
} from '../../../utils/controllers.ts';
import { buildHarness } from '../../../utils/harness.ts';
import type { Harness } from '../../../utils/harness.ts';
import { createRecordingLogger } from '../../../utils/logger.ts';
import { closeServer, freePort, listenOn } from '../../../utils/port.ts';

const START = new Date('2026-11-15T00:00:00Z');

const triage: Agent = defineModelAgent({
    name: 'triage',
    model: textModel(),
    instructions: 'triage',
    channels: [http.on()],
});

let harnesses: Harness[] = [];
let apps: IApp[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((h) => h.stop()));
    await Promise.all(apps.map((app) => app.stop().catch(() => {})));
    harnesses = [];
    apps = [];
});

/** A module without dependencies whose setup records itself and registers `register`'s contributions. */
function contributing(name: string, events: string[], register: (container: IContainer) => void): IModule {
    return {
        name,
        async setup(container) {
            events.push(`${name} setup`);
            register(container);
        },
    };
}

/** Records every module's setup into `events`, under the module's name. */
function recordingSetup(module: IModule, events: string[]): IModule {
    return {
        name: module.name,
        dependencies: module.dependencies,
        async setup(container) {
            events.push(`${module.name} setup`);
            await module.setup(container);
        },
        ...(module.onReady && { onReady: (container: IContainer) => module.onReady!.call(module, container) }),
        ...(module.teardown && { teardown: (container: IContainer) => module.teardown!.call(module, container) }),
    };
}

/** Contributes a NoteController through a factory that records each call. */
function noteControllers(events: string[]): IModule {
    return contributing('notes', events, (container) => {
        container.registerMany(AppToken.HTTP_CONTROLLERS, {
            useFactory: (c) => {
                events.push('factory');

                return new NoteController({ clock: c.resolve(AppToken.ENGINE).clock });
            },
        });
    });
}

function documents(events: string[], ...docs: object[]): IModule {
    return contributing('documents', events, (container) => {
        for (const doc of docs) {
            container.registerMany(AppToken.OPENAPI_DOCUMENTS, { useValue: doc });
        }
    });
}

async function build(options: {
    mode?: AppMode;
    before?: IModule[];
    after?: IModule[];
    http?: HttpModuleOptions;
    events?: string[];
} = {}) {
    const port = await freePort();
    const clock = new ControllableClock(START);
    const logger = createRecordingLogger(clock);
    const events = options.events ?? [];
    const builtIn = [
        configModule({ clock, logger }),
        // a given store: migrate mode then never connects to its DATABASE_URL
        storeModule({ store: createMemoryStore({ clock }) }),
        staticTokensModule(),
        engineModule(),
        schedulerModule(),
    ].map((module) => recordingSetup(module, events));
    const harness = buildHarness({
        mode: options.mode ?? 'start',
        env: {
            HOST: '127.0.0.1',
            PORT: String(port),
            CHAMVI_TOKENS: TOKENS,
            ...(options.mode === 'migrate' && { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/db' }),
        },
        agents: [triage],
        modules: [
            ...builtIn,
            ...(options.before ?? []),
            recordingSetup(httpModule({ openapi: false, ...options.http }), events),
            ...(options.after ?? []),
        ],
    });

    harnesses.push(harness);

    return {
        harness,
        clock,
        url: (path: string) => `http://127.0.0.1:${port}${path}`,
    };
}

const authorization = { authorization: `Bearer ${TOKEN}`, accept: 'application/json' };

async function served(url: string): Promise<{ paths: Record<string, unknown> }> {
    const response = await fetch(url, { headers: authorization });

    expect(response.status).toBe(200);

    return await response.json() as { paths: Record<string, unknown> };
}

describe('AppToken.HTTP_CONTROLLERS', () => {
    it.each(['before', 'after'] as const)('serves a controller contributed by a module listed %s the http module, built once after every setup', async (position) => {
        const events: string[] = [];
        const notes = noteControllers(events);
        const { harness, url } = await build({ events, [position]: [notes] });

        await harness.setup();

        const response = await fetch(url('/notes/now'), { headers: authorization });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ now: START.toISOString() });
        expect(events.filter((event) => event === 'factory')).toHaveLength(1);
        // every setup ran before the factory
        expect(events.at(-1)).toBe('factory');
        expect(events.filter((event) => event.endsWith(' setup'))).toHaveLength(7);
    });

    it('mounts the httpModule option\'s controllers and the contributed ones together', async () => {
        const events: string[] = [];
        const { harness, url } = await build({
            events,
            http: { controllers: [new MemoController()] },
            after: [noteControllers(events)],
        });

        await harness.setup();

        expect(await (await fetch(url('/memos'), { headers: authorization })).json()).toEqual([]);
        expect(await (await fetch(url('/notes/now'), { headers: authorization })).json()).toEqual({ now: START.toISOString() });
    });

    it('answers a route the option\'s and a contributed controller share from the option\'s', async () => {
        const earlier = new Date(0);
        const { harness, url } = await build({
            http: { controllers: [new NoteController({ clock: new ControllableClock(earlier) })] },
            after: [noteControllers([])],
        });

        await harness.setup();

        expect(await (await fetch(url('/notes/now'), { headers: authorization })).json()).toEqual({ now: earlier.toISOString() });
    });

    it.each(['job', 'migrate'] as const)('never runs the factory in %s mode', async (mode) => {
        const events: string[] = [];
        const { harness } = await build({ mode, after: [noteControllers(events)] });

        await harness.setup();
        expect(events).not.toContain('factory');
    });

    describe('in a check', () => {
        function checkApp(modules: IModule[]): IApp {
            const clock = new ControllableClock(START);
            const app = createApp({
                agents: [triage],
                modules: [
                    configModule({ clock, logger: createRecordingLogger(clock) }),
                    storeModule({ store: createMemoryStore({ clock }) }),
                    httpModule({ openapi: false }),
                    ...modules,
                ],
            });

            apps.push(app);

            return app;
        }

        async function envFor() {
            const port = await freePort();

            return {
                port,
                env: {
                    HOST: '127.0.0.1',
                    PORT: String(port),
                    CHAMVI_TOKENS: TOKENS,
                },
            };
        }

        function contributes(factory: (container: IContainer) => object): IModule {
            return {
                name: 'contributes',
                async setup(container) {
                    container.registerMany(AppToken.HTTP_CONTROLLERS, { useFactory: factory });
                },
            };
        }

        it('refuses a controller under a base path of chamvi\'s own', async () => {
            const app = checkApp([contributes(() => new RunsController())]);
            const { env } = await envFor();
            const error = await rejectionOf(app.check({ env }));

            expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        });

        it('constructs a valid controller and listens nowhere', async () => {
            let built = 0;
            const app = checkApp([contributes((c) => {
                built++;

                return new NoteController({ clock: c.resolve(AppToken.ENGINE).clock });
            })]);
            const { port, env } = await envFor();

            await expect(app.check({ env })).resolves.toEqual({ issues: [] });
            expect(built).toBe(1);
            // the port is free: nothing listened
            await closeServer(await listenOn(port));
        });

        it('fails with the error of a throwing factory', async () => {
            const thrown = new Error('no notes service');
            const app = checkApp([contributes(() => {
                throw thrown;
            })]);
            const { env } = await envFor();

            expect(await rejectionOf(app.check({ env }))).toBe(thrown);
        });

        it('fails a start with the error of a throwing factory', async () => {
            const thrown = new Error('no notes service');
            const app = checkApp([contributes(() => {
                throw thrown;
            })]);
            const { port, env } = await envFor();

            expect(await rejectionOf(app.start({ env }))).toBe(thrown);
            await closeServer(await listenOn(port));
        });
    });
});

describe('AppToken.OPENAPI_DOCUMENTS', () => {
    const a = openApiDocument('/notes', 'listNotes');
    const b = openApiDocument('/memos', 'listMemos');

    it('merges a contributed document into /openapi.json', async () => {
        const { harness, url } = await build({ http: { openapi: {} }, after: [documents([], b)] });

        await harness.setup();

        const document = await served(url('/openapi.json'));

        expect(document.paths['/memos']).toBeDefined();
        expect(document.paths['/runs']).toBeDefined();
    });

    it('merges the option\'s documents and the contributed ones', async () => {
        const { harness, url } = await build({ http: { openapi: { documents: [a] } }, after: [documents([], b)] });

        await harness.setup();

        const document = await served(url('/openapi.json'));

        expect(document.paths['/notes']).toBeDefined();
        expect(document.paths['/memos']).toBeDefined();
    });

    it('fails a check with the merge\'s error on a colliding contributed document', async () => {
        const clock = new ControllableClock(START);
        const app = createApp({
            agents: [triage],
            modules: [
                configModule({ clock, logger: createRecordingLogger(clock) }),
                storeModule({ store: createMemoryStore({ clock }) }),
                httpModule({ openapi: { documents: [a] } }),
                documents([], openApiDocument('/notes', 'otherNotes')),
            ],
        });

        apps.push(app);

        const error = await rejectionOf(app.check({
            env: {
                HOST: '127.0.0.1',
                PORT: String(await freePort()),
                CHAMVI_TOKENS: TOKENS,
            },
        }));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toBe('The OpenAPI path "GET /notes" is contributed twice.');
    });

    it('ignores a contributed document with openapi: false', async () => {
        const { harness, url } = await build({ http: { openapi: false }, after: [documents([], b)] });

        await harness.setup();
        expect((await fetch(url('/openapi.json'), { headers: authorization })).status).toBe(404);
    });
});
