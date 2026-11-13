/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import {
    createConnectionConfigStore,
    createKeyring,
    createMemoryStore,
} from '@chamvi/core';
import type {
    ConnectionTypeDefinition,
    IConnectionHandle,
    IConnectionTypeProvider,
} from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import {
    ADMIN_TOKEN,
    READER_TOKEN,
    approvalIdOf,
    call,
    createRunAgents,
    createTestApp,
} from '../../utils/app.ts';
import type { CallOptions } from '../../utils/app.ts';

type Schema = Record<string, any>;

type Document = {
    paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, { schema?: Schema }> }> }>>;
    components: { schemas: Record<string, Schema> };
};

const FILE = fileURLToPath(new URL('../../../dist/swagger.json', import.meta.url));

function load(): Document | undefined {
    if (!existsSync(FILE)) {
        if (process.env.CI) {
            throw new Error(`${FILE} is missing: build @chamvi/http first.`);
        }

        process.stderr.write(`[openapi] ${FILE} is missing, skipping the response spec (run the build first).\n`);

        return undefined;
    }

    return JSON.parse(readFileSync(FILE, 'utf8')) as Document;
}

const document = load();

const DOCUMENT_ID = 'https://chamvi.test/openapi.json';

/**
 * An Ajv in 2020-12 mode (the OpenAPI 3.1+ schema dialect) over the
 * document's components, kept strict: an unknown keyword or format fails
 * the spec instead of being skipped. `discriminator` is OpenAPI's (the
 * `oneOf` still decides), `double` a number format, `date-time` checked by
 * shape. Only `strictTypes` is off: trapi writes `unknown` as
 * `{ additionalProperties: true }` without a `type`, valid JSON Schema
 * (any value) that the strict-types lint refuses to compile.
 */
function createAjv(doc: Document): Ajv2020 {
    const ajv = new Ajv2020({
        allErrors: true,
        strict: true,
        strictTypes: false,
    });

    ajv.addKeyword({ keyword: 'discriminator', schemaType: 'object' });
    ajv.addFormat('double', { type: 'number', validate: () => true });
    ajv.addFormat('date-time', {
        type: 'string',
        validate: (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
            !Number.isNaN(Date.parse(value)),
    });
    ajv.addSchema(withDocumentRefs({ $id: DOCUMENT_ID, $defs: doc.components.schemas }));

    return ajv;
}

/** `schema` with `#/components/schemas/X` refs pointing into the registered `$defs`. */
function withDocumentRefs(schema: Schema): Schema {
    return JSON.parse(JSON.stringify(schema).replaceAll('"#/components/schemas/', `"${DOCUMENT_ID}#/$defs/`)) as Schema;
}

/** A request, the documented path template it hits, the status it must answer, and its token and body. */
type Probe = [method: string, template: string, path: string, status: number, token?: string, body?: unknown];

describe.skipIf(!document)('live responses against the openapi document', () => {
    const doc = document as Document;
    // built in a hook: the suite body also runs when the suite is skipped, without a document
    let ajv: Ajv2020;

    beforeAll(() => {
        ajv = createAjv(doc);
    });

    const validators = new Map<string, ValidateFunction>();

    /** The documented JSON schema for the answer, the `default` response for a status the operation does not list. */
    function validatorFor(method: string, template: string, status: number): ValidateFunction {
        const operation = doc.paths[template]?.[method.toLowerCase()];

        expect(operation, `${method} ${template} is documented`).toBeDefined();

        const key = String(status);
        const response = operation!.responses[key] ?? operation!.responses.default;
        const schema = response?.content?.['application/json']?.schema;
        const label = `${method} ${template} ${operation!.responses[key] ? key : 'default'}`;

        expect(schema, `${label} has a JSON schema`).toBeDefined();

        let validate = validators.get(label);

        if (!validate) {
            validate = ajv.compile(withDocumentRefs(schema!));
            validators.set(label, validate);
        }

        return validate;
    }

    /** Sends the probe, checks its status and validates the JSON body against the document; the body. */
    async function expectDocumented(app: Parameters<typeof call>[0], probe: Probe): Promise<any> {
        const [method, template, path, status, token, body] = probe;
        const options: CallOptions = {};

        if (token) {
            options.token = token;
        }

        if (body !== undefined) {
            options.body = body;
        }

        const response = await call(app, method, path, options);
        const label = `${method} ${path}`;

        expect(response.status, label).toBe(status);
        expect(response.headers.get('content-type'), label).toContain('application/json');

        const json = await response.json();
        const validate = validatorFor(method, template, status);

        expect(validate(json) ? [] : validate.errors, `${label} (${status}) matches the document`).toEqual([]);

        return json;
    }

    describe('the runs and the agent state', () => {
        const clock = new ControllableClock(new Date(1_000_000));
        const setup = createTestApp({ agents: createRunAgents(), clock });
        const {
            app,
            engine,
            store,
        } = setup;
        const runs: Record<string, string> = {};

        beforeAll(async () => {
            const start = async (agent: string, body?: unknown): Promise<string> => {
                const response = await call(app, 'POST', `/agents/${agent}/runs`, { token: ADMIN_TOKEN, body });

                return (await response.json() as { runId: string }).runId;
            };

            // no payload: the run is served without `trigger.payload`
            runs.bare = await start('echo');
            runs.full = await start('echo', {
                payload: { text: 'hi', n: 1 },
                idempotencyKey: 'full-1',
                address: 'thread-1',
                attachments: [{
                    mediaType: 'image/png',
                    filename: 'a.png',
                    data: Buffer.from([137, 80, 78, 71]).toString('base64'),
                }],
            });
            runs.gate = await start('gate');
            runs.cancelled = await start('echo');
            await call(app, 'POST', `/runs/${runs.cancelled}/cancel`, { token: ADMIN_TOKEN });
            runs.choose = await start('choose');

            await engine.start();
            await engine.idle();

            await store.state.set('echo', 'counter', 3);
            await store.state.set('echo', 'nested', { a: [1, 'b', null] });
            await store.state.upsertDocument('echo', 'items', 'i1', { color: 'red', qty: 3 });
        });

        afterAll(async () => {
            await engine.drain();
        });

        const KV = '/agents/{name}/state/kv/{key}';

        it.each<Probe>([
            ['GET', '/healthz', '/healthz', 200],
            ['GET', '/readyz', '/readyz', 200],
            ['GET', '/me', '/me', 200, ADMIN_TOKEN],
            ['GET', '/me', '/me', 401],
            ['POST', '/authorization/check', '/authorization/check', 200, READER_TOKEN, { names: ['chamvi_run_read', 'chamvi_agent_run'] }],
            ['POST', '/authorization/check', '/authorization/check', 200, READER_TOKEN],
            ['POST', '/authorization/check', '/authorization/check', 400, READER_TOKEN, { names: 'x' }],
            ['GET', '/agents', '/agents', 200, ADMIN_TOKEN],
            ['GET', '/schedules', '/schedules', 200, ADMIN_TOKEN],
            ['GET', '/agents/{name}/state/kv', '/agents/echo/state/kv', 200, ADMIN_TOKEN],
            ['GET', '/agents/{name}/state/kv', '/agents/echo/state/kv?page[limit]=0', 400, ADMIN_TOKEN],
            ['GET', KV, '/agents/echo/state/kv/nested', 200, ADMIN_TOKEN],
            ['GET', KV, '/agents/echo/state/kv/unset', 200, ADMIN_TOKEN],
            ['GET', KV, '/agents/nobody/state/kv/counter', 404, ADMIN_TOKEN],
            ['PATCH', KV, '/agents/echo/state/kv/written', 200, ADMIN_TOKEN, { value: { ok: true } }],
            ['PATCH', KV, '/agents/echo/state/kv/written', 400, ADMIN_TOKEN, { other: 1 }],
            ['GET', '/agents/{name}/state/collections/{collection}', '/agents/echo/state/collections/items?filter[color]=red', 200, ADMIN_TOKEN],
            ['POST', '/agents/{name}/runs', '/agents/echo/runs', 403, READER_TOKEN],
            ['POST', '/agents/{name}/runs', '/agents/nobody/runs', 404, ADMIN_TOKEN],
            ['POST', '/agents/{name}/runs', '/agents/echo/runs', 400, ADMIN_TOKEN, { attachments: [{ mediaType: 'png', data: 1 }] }],
            ['GET', '/runs', '/runs', 200, ADMIN_TOKEN],
            ['GET', '/runs', '/runs?filter[waiting]=approval&sort=-createdAt', 200, ADMIN_TOKEN],
            ['GET', '/runs', '/runs?filter[status]=bogus', 400, ADMIN_TOKEN],
            ['GET', '/runs/{id}', '/runs/00000000-0000-7000-8000-000000000000', 404, ADMIN_TOKEN],
        ])('%s %s (%s) answers %i as documented', async (...probe) => {
            await expectDocumented(app, probe);
        });

        it('a 400 carries its validation issues', async () => {
            const body = await expectDocumented(app, ['PATCH', KV, '/agents/echo/state/kv/written', 400, ADMIN_TOKEN, { other: 1 }]);

            expect(body.issues?.length).toBeGreaterThan(0);
        });

        it.each(['bare', 'full', 'gate', 'cancelled'])('GET /runs/{id} of the %s run', async (name) => {
            const body = await expectDocumented(app, ['GET', '/runs/{id}', `/runs/${runs[name]}`, 200, ADMIN_TOKEN]);

            if (name === 'bare') {
                // the case the document must allow: a run started without a payload
                expect(body.trigger).not.toHaveProperty('payload');
            }

            if (name === 'gate') {
                expect(body.waiting?.kind).toBe('approval');
            }
        });

        it('GET /runs/{id}/artifacts of the run with an attachment', async () => {
            const body = await expectDocumented(app, ['GET', '/runs/{id}/artifacts', `/runs/${runs.full}/artifacts`, 200, ADMIN_TOKEN]);

            expect(body.data).toHaveLength(1);
        });

        it('POST /agents/{name}/runs twice (deduplicated), then cancel and approve', async () => {
            const body = { payload: 'text', idempotencyKey: 'again' };

            await expectDocumented(app, ['POST', '/agents/{name}/runs', '/agents/echo/runs', 202, ADMIN_TOKEN, body]);

            const again = await expectDocumented(app, ['POST', '/agents/{name}/runs', '/agents/echo/runs', 202, ADMIN_TOKEN, body]);

            expect(again.deduplicated).toBe(true);
            await expectDocumented(app, ['POST', '/runs/{id}/cancel', `/runs/${runs.choose}/cancel`, 202, ADMIN_TOKEN]);

            const approvalId = await approvalIdOf(store, runs.gate!);

            await expectDocumented(app, ['POST', '/runs/{id}/approve', `/runs/${runs.gate}/approve`, 400, ADMIN_TOKEN, { approved: 'yes' }]);
            await expectDocumented(app, ['POST', '/runs/{id}/approve', `/runs/${runs.gate}/approve`, 202, ADMIN_TOKEN, { approvalId, approved: false }]);
            await engine.idle();
        });
    });

    describe('the connections', () => {
        const definition: ConnectionTypeDefinition = {
            type: 'mail',
            label: 'Mail',
            multiple: true,
            fields: [
                {
                    key: 'host',
                    label: 'Host',
                    kind: 'string',
                    required: true,
                },
                {
                    key: 'port',
                    label: 'Port',
                    kind: 'number',
                },
                {
                    key: 'password',
                    label: 'Password',
                    kind: 'secret',
                    required: true,
                },
            ],
        };
        const provider: IConnectionTypeProvider = {
            definition,
            creatable: () => true,
            connections: () => [],
        };
        const handle: IConnectionHandle = {
            name: 'alpha',
            type: 'whatsapp',
            status: () => 'pairing',
            widgets: () => [],
            subscribe: () => () => {},
            actions: { reset: async () => undefined },
        };
        const clock = new ControllableClock(new Date(1_000_000));
        const store = createMemoryStore({ clock });
        const key = randomBytes(32);
        const { app } = createTestApp({
            store,
            clock,
            connections: () => [handle],
            connectionTypes: () => [provider],
            connectionConfigs: createConnectionConfigStore({
                store,
                clock,
                keyring: () => createKeyring([{ id: 'k1', key }]),
            }),
            uiPages: () => [{
                slug: 'mail',
                label: 'Mail',
                types: ['mail'],
                path: '/ui/ext/mail',
            }],
        });

        it('answers each connection route as documented', async () => {
            const settings = { host: 'imap.test', port: 993 };
            const created = await expectDocumented(app, [
                'POST',
                '/connection-types/{type}/connections',
                '/connection-types/mail/connections',
                201,
                ADMIN_TOKEN,
                {
                    account: 'work',
                    settings,
                    secrets: { password: 'secret' },
                },
            ]);
            const name = created.name as string;

            await expectDocumented(app, [
                'POST',
                '/connection-types/{type}/connections',
                '/connection-types/mail/connections',
                400,
                ADMIN_TOKEN,
                { account: 'other', settings: { port: 'x' } },
            ]);

            const reads: [string, string][] = [
                ['/connections', '/connections'],
                ['/connections/{name}', '/connections/alpha'],
                ['/connections/{name}', `/connections/${name}`],
                ['/connections/{name}/config', `/connections/${name}/config`],
                ['/connection-types', '/connection-types'],
                ['/ui-pages', '/ui-pages'],
            ];

            for (const [template, path] of reads) {
                await expectDocumented(app, ['GET', template, path, 200, ADMIN_TOKEN]);
            }

            await expectDocumented(app, ['GET', '/connections/{name}', '/connections/missing', 404, ADMIN_TOKEN]);
            await expectDocumented(app, ['PUT', '/connections/{name}/config', `/connections/${name}/config`, 200, ADMIN_TOKEN, { settings: { ...settings, port: 143 } }]);
            await expectDocumented(app, ['POST', '/connections/{name}/reset', '/connections/alpha/reset', 202, ADMIN_TOKEN]);
            await expectDocumented(app, ['DELETE', '/connections/{name}', `/connections/${name}`, 200, ADMIN_TOKEN]);
        });
    });
});
