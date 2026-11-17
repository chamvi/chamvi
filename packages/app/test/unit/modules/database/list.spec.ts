/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { ControllableClock } from '@chamvi/test-kit';
import type { IContainer } from 'eldin';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    AppToken,
    DatabaseToken,
    configModule,
    createApp,
    databaseModule,
    defineSchema,
} from '@chamvi/app';
import type { IApp, IModule } from '@chamvi/app';
import { memoryStoreModule } from '@chamvi/app/testing';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import {
    AUTHOR_LIST_SCHEMA,
    AuthorController,
    AuthorEntity,
    AuthorRepository,
    NoteEntity,
    notesDatabase,
} from '../../../fixtures/database/index.ts';
import { TOKEN, TOKENS, rejectionOf } from '../../../utils/app.ts';
import { createTestDatabaseUrl, describePostgres } from '../../../utils/database.ts';
import { createRecordingLogger } from '../../../utils/logger.ts';
import { freePort } from '../../../utils/port.ts';

const MARKER = `marker${randomUUID().replaceAll('-', '')}`;

let apps: IApp[] = [];

afterEach(async () => {
    await Promise.all(apps.map((app) => app.stop().catch(() => {})));
    apps = [];
});

/** The authors module of an app: its controller on the database module's data source. */
const authors: IModule = {
    name: 'authors',
    dependencies: ['chamvi:db:default'],
    async setup(container) {
        const controller = (c: IContainer) => new AuthorController(new AuthorRepository(c.resolve(DatabaseToken.DATA_SOURCE)));

        container.registerMany(AppToken.HTTP_CONTROLLERS, { useFactory: controller });
    },
};

function build(modules: IModule[]) {
    const logger = createRecordingLogger(new ControllableClock());
    const app = createApp({ agents: [], modules: [configModule({ logger }), memoryStoreModule(), ...modules] });

    apps.push(app);

    return { app, logger };
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

function uuid(n: number): string {
    return `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
}

async function startAuthors(extra: Record<string, string> = {}) {
    const { app, logger } = build([databaseModule(notesDatabase({ schemas: [AUTHOR_LIST_SCHEMA] })), authors]);
    const { port, env } = await envFor(extra);

    await app.start({ env });

    const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };

    for (const [n, name] of [[3, 'ada'], [1, 'Ada'], [2, 'bob'], [4, 'ad']] as const) {
        const response = await fetch(`http://127.0.0.1:${port}/authors`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ id: uuid(n), name }),
        });

        expect(response.status).toBe(200);
    }

    return {
        logger,
        get: (query: string) => fetch(`http://127.0.0.1:${port}/authors?${query}`, { headers: { authorization: `Bearer ${TOKEN}` } }),
    };
}

/** The safety properties of an app's list endpoint, on one driver. */
function describeListEndpoint(extra: () => Promise<Record<string, string>>) {
    it('answers the page the schema allows: matched case-sensitively, the key breaking ties, the default limit', async () => {
        const { get } = await startAuthors(await extra());
        const exact = await get('filter[name]=ada');

        expect(exact.status).toBe(200);
        expect(await exact.json()).toEqual({
            data: [{ id: uuid(3), name: 'ada' }],
            meta: {
                total: 1,
                limit: 2,
                offset: 0,
            },
        });

        // inserted 3, 1, 2, 4: without a sort the key orders them
        expect((await (await get('page[limit]=10')).json()).data.map((author: { id: string }) => author.id)).toEqual([uuid(1), uuid(2), uuid(3), uuid(4)]);
        expect((await (await get('page[offset]=2')).json())).toEqual({
            data: [{ id: uuid(3), name: 'ada' }, { id: uuid(4), name: 'ad' }],
            meta: {
                total: 4,
                limit: 2,
                offset: 2,
            },
        });
        expect((await (await get('sort=-name&page[limit]=10')).json()).data.map((author: { name: string }) => author.name)).toEqual(['bob', 'ada', 'ad', 'Ada']);
    });

    it('a value that is no uuid on the uuid key matches nothing and never reaches the driver', async () => {
        const { get, logger } = await startAuthors(await extra());
        const response = await get(`filter[id]=${MARKER}`);

        expect(response.status).toBe(200);
        expect((await response.json()).data).toEqual([]);
        expect(logger.lines.join('\n')).not.toContain(MARKER);
    });

    it('a filter, a sort or a limit the schema does not allow is a 400 naming the key, without the value', async () => {
        const { get, logger } = await startAuthors(await extra());

        for (const [query, key] of [[`filter[secret]=${MARKER}`, 'secret'], ['sort=id', 'id'], ['page[limit]=11', '10'], ['include=author.organization', 'author'], [`filter[name]=~${MARKER}`, 'filter[name]']]) {
            const response = await get(query!);
            const text = await response.text();

            expect(response.status).toBe(400);
            expect(JSON.parse(text)).toMatchObject({ status: 400, code: 'bad_request' });
            expect(JSON.parse(text).message).toContain(key);
            expect(text).not.toContain(MARKER);
        }

        expect(logger.lines.join('\n')).not.toContain(MARKER);
    });
}

describe('an app\'s list endpoint on SQLite', () => {
    describeListEndpoint(async () => ({}));
});

describePostgres('an app\'s list endpoint on PostgreSQL', () => {
    describeListEndpoint(async () => ({ DATABASE_URL: await createTestDatabaseUrl() }));
});

describe('databaseModule({ schemas })', () => {
    it('starts when every schema matches its entity', async () => {
        const { app } = build([databaseModule(notesDatabase({
            schemas: [AUTHOR_LIST_SCHEMA, defineSchema({
                entity: NoteEntity,
                filters: ['authorId'],
                relations: ['author'],
            })],
        }))]);
        const { env } = await envFor();

        await expect(app.start({ env })).resolves.toBeUndefined();
    });

    it('a schema naming a column the entity lacks fails the app\'s setup before serving, naming the database, the schema and the field', async () => {
        const wrong = defineSchema<{ id: string; nickname: string }>({
            name: 'authors',
            entity: AuthorEntity,
            filters: ['nickname'],
        });
        const { app } = build([databaseModule(notesDatabase({ schemas: [wrong] })), authors]);
        const { port, env } = await envFor();

        const error = await rejectionOf(app.start({ env }));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toContain('"default"');
        expect(error.message).toContain('"authors"');
        expect(error.message).toContain('"nickname"');
        await expect(fetch(`http://127.0.0.1:${port}/authors`)).rejects.toThrow();
    });

    it('a relation that is no relation of the entity fails a check too', async () => {
        const wrong = defineSchema({ entity: NoteEntity, relations: ['body'] });
        const { app } = build([databaseModule(notesDatabase({ schemas: [wrong] }))]);
        const { env } = await envFor();

        const result = await app.check({ env }).catch((error: unknown) => error);

        expect(result).toBeInstanceOf(InvalidAgentDefinitionError);
        expect((result as Error).message).toContain('"body"');
    });

    it('a schema without an entity is refused when the module is built', () => {
        expect(() => databaseModule(notesDatabase({ schemas: [defineSchema({ filters: ['name'] })] }))).toThrow(InvalidAgentDefinitionError);
        expect(() => databaseModule(notesDatabase({ schemas: 'all' as never }))).toThrow(InvalidAgentDefinitionError);
    });
});
