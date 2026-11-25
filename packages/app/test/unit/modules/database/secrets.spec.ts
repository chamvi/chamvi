/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import { DatabaseUnavailableError } from '@chamvi/store-db';
import { ControllableClock } from '@chamvi/test-kit';
import type { IContainer } from 'eldin';
import { DataSource, EntitySchema } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';
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
} from '@chamvi/app';
import type { IApp, IModule } from '@chamvi/app';
import { memoryStoreModule } from '@chamvi/app/testing';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import {
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

/** A value no error, log line or HTTP answer may carry. */
function marker(kind: string): string {
    return `${kind}${randomUUID().replaceAll('-', '')}`;
}

let apps: IApp[] = [];

afterEach(async () => {
    await Promise.all(apps.map((app) => app.stop().catch(() => {})));
    apps = [];
});

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
            TOKENS,
            ...extra,
        },
    };
}

function expectHidden(secret: string, ...texts: unknown[]): void {
    for (const text of texts) {
        expect(typeof text === 'string' ? text : inspect(text, { depth: 10 })).not.toContain(secret);
    }
}

describe('an app database keeps its secrets', () => {
    it('a password marker in no error or log line when the connection fails', async () => {
        const password = marker('pw');
        const { app, logger } = build([databaseModule(notesDatabase())]);
        const { env } = await envFor({ DATABASE_URL: `postgres://app:${password}@127.0.0.1:1/app` });

        const error = await rejectionOf(app.start({ env }));

        expect(error).toBeInstanceOf(DatabaseUnavailableError);
        expectHidden(password, error, logger.lines.join('\n'));
    });

    it('a row and a parameter marker in no HTTP answer or log line when a write fails', async () => {
        const row = marker('row');
        const parameter = marker('param');
        const authors: IModule = {
            name: 'authors',
            dependencies: ['chamvi:db:default'],
            async setup(container) {
                const controller = (c: IContainer) => new AuthorController(new AuthorRepository(c.resolve(DatabaseToken.DATA_SOURCE)));

                container.registerMany(AppToken.HTTP_CONTROLLERS, { useFactory: controller });
            },
        };
        const { app, logger } = build([databaseModule(notesDatabase()), authors]);
        const { port, env } = await envFor();

        await app.start({ env });

        const post = (body: object) => fetch(`http://127.0.0.1:${port}/authors`, {
            method: 'POST',
            headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });

        const id = randomUUID();

        expect((await post({ id, name: row })).status).toBe(200);

        // the same id again: the stored row holds one marker, the statement's parameters the other
        const conflict = await post({ id, name: parameter });
        const answer = await conflict.text();

        expect(conflict.status).toBe(409);
        expectHidden(row, answer, logger.lines.join('\n'));
        expectHidden(parameter, answer, logger.lines.join('\n'));
    });
});

/** A fresh database owned by a new role whose password is `password`, as a URL of that role. */
async function urlWithPassword(password: string): Promise<string> {
    const url = new URL(await createTestDatabaseUrl());
    const role = `chamvi_role_${randomUUID().replaceAll('-', '')}`;
    const seed = new DataSource({ type: 'postgres', url: url.href });

    await seed.initialize();

    try {
        await seed.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
        await seed.query(`ALTER DATABASE "${url.pathname.slice(1)}" OWNER TO "${role}"`);
    } finally {
        await seed.destroy();
    }

    url.username = role;
    url.password = password;

    return url.href;
}

describePostgres('an app database on PostgreSQL keeps its secrets', () => {
    it('an entity mistake is a configuration error with TypeORM\'s message, no url or password in it', async () => {
        const password = marker('pw');
        const url = await urlWithPassword(password);
        const bare = new EntitySchema<{ title: string }>({
            name: 'bare_note',
            tableName: 'bare_notes',
            columns: { title: { type: 'varchar', length: 64 } },
        });

        for (const [entities, expected] of [
            [[NoteEntity], 'NoteEntity#author'],
            [[AuthorEntity, bare], 'bare_note'],
        ] as const) {
            const { app, logger } = build([databaseModule(notesDatabase({ entities: [...entities] }))]);
            const { env } = await envFor({ DATABASE_URL: url });

            const error = await rejectionOf(app.start({ env }));

            expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
            expect(error.message).toContain(expected);
            expectHidden(password, error, logger.lines.join('\n'));
            expectHidden(new URL(url).host, error.message);
        }
    });


    it('a wrong password in no error or log line', async () => {
        const url = new URL(await createTestDatabaseUrl());
        const password = marker('pw');

        url.password = password;

        const { app, logger } = build([databaseModule(notesDatabase())]);
        const { env } = await envFor({ DATABASE_URL: url.href });

        const error = await rejectionOf(app.start({ env }));

        expect(error).toBeInstanceOf(DatabaseUnavailableError);
        expect(error).toMatchObject({ operation: 'connect', driverCode: '28P01' });
        expectHidden(password, error, logger.lines.join('\n'));
    });

    it('a row and a parameter marker in no error or log line when a migration fails', async () => {
        const url = await createTestDatabaseUrl();
        const row = marker('row');
        const parameter = marker('param');
        const seed = new DataSource({ type: 'postgres', url });

        await seed.initialize();

        try {
            await seed.query('CREATE TABLE "fixture_seen" ("value" text PRIMARY KEY)');
            await seed.query('INSERT INTO "fixture_seen" ("value") VALUES ($1)', [row]);
        } finally {
            await seed.destroy();
        }

        // a duplicate of the stored row: PostgreSQL's detail names the value; the statement also carries a parameter
        class Duplicate1795000000009 implements MigrationInterface {
            name = 'Duplicate1795000000009';

            async up(queryRunner: QueryRunner): Promise<void> {
                await queryRunner.query('INSERT INTO "fixture_seen" ("value") SELECT unnest(ARRAY[$1, $2]::text[])', [parameter, row]);
            }

            async down(): Promise<void> {
                // nothing to undo: up never succeeds
            }
        }

        const { app, logger } = build([databaseModule(notesDatabase({ migrations: [Duplicate1795000000009] }))]);
        const { env } = await envFor({ DATABASE_URL: url });

        const error = await rejectionOf(app.start({ env }));

        expect(error).toBeInstanceOf(DatabaseUnavailableError);
        expect(error).toMatchObject({ operation: 'migrate', driverCode: '23505' });
        expectHidden(row, error, logger.lines.join('\n'));
        expectHidden(parameter, error, logger.lines.join('\n'));
    });
});
