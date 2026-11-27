/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import {
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import { PERMISSION_NAMES, Permission } from '@chamvi/access';
import {
    agent,
    agentChannel,
    createConnectionConfigStore,
    createKeyring,
    defineModelAgent,
} from '@chamvi/core';
import type {
    ConnectionTypeDefinition,
    IConnectionTypeProvider,
    IPeerResolver,
} from '@chamvi/core';
import { ControllableClock, createTestEngine } from '@chamvi/test-kit';
import { staticTokens } from '@chamvi/http';
import {
    ADMIN_TOKEN,
    approvalWaitOf,
    call,
    createRunTestApp,
    createTestApp,
    testAuth,
    testChannels,
} from '../../utils/app.ts';
import { textModel } from '../../utils/model.ts';

/*
 * The request validation of every body a route reads with a validup container:
 * the issues (path, code, message, the bounded `received`) as the HTTP error body
 * carries them, so a replacement of the validators keeps the wire.
 */

type Expected = {
    status: number;
    /** The response body, left out where it holds a generated id. */
    body?: unknown;
};

type Row = {
    title: string;
    /** The request body, or a function building it when it depends on the state of the app. */
    body: unknown;
    expected: Expected;
};

async function verify(response: Response, expected: Expected): Promise<void> {
    expect(response.status).toBe(expected.status);

    if (expected.body !== undefined) {
        expect(await response.json()).toEqual(expected.body);
    }
}

const NUL = 'a\0b';

/** `n` characters. */
function chars(n: number): string {
    return 'a'.repeat(n);
}

describe('POST /agents/:name/runs (the start body)', () => {
    const ATTACHMENT = { mediaType: 'text/plain', data: 'aGk=' };
    /* eslint-disable @stylistic/object-curly-newline -- one issue per line keeps the pinned wire readable */
    const rows: Row[] = [
        {
            title: 'accepts an empty body',
            body: {},
            expected: { status: 202 },
        },
        {
            title: 'accepts a null payload',
            body: { payload: null },
            expected: { status: 202 },
        },
        {
            title: 'accepts every field at its upper bound',
            body: {
                payload: { a: 1 },
                idempotencyKey: chars(255),
                address: chars(255),
                attachments: Array.from({ length: 16 }, () => ({ ...ATTACHMENT, filename: chars(255) })),
            },
            expected: { status: 202 },
        },
        {
            title: 'refuses an array body',
            body: [1],
            expected: { status: 400, body: { status: 400, code: 'bad_request', message: 'The request body must be a JSON object.' } },
        },
        {
            title: 'refuses a string body',
            body: 'x',
            expected: { status: 400, body: { status: 400, code: 'bad_request', message: 'The request body must be a JSON object.' } },
        },
        {
            title: 'refuses a null body',
            body: null,
            expected: { status: 400, body: { status: 400, code: 'bad_request', message: 'The request body must be a JSON object.' } },
        },
        {
            title: 'idempotencyKey: a number',
            body: { idempotencyKey: 5 },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property idempotencyKey is invalid',
                    issues: [{ type: 'item', path: ['idempotencyKey'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 5, meta: { optional: true } }],
                },
            },
        },
        {
            title: 'idempotencyKey: null',
            body: { idempotencyKey: null },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property idempotencyKey is invalid',
                    issues: [{ type: 'item', path: ['idempotencyKey'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: null, meta: { optional: true } }],
                },
            },
        },
        {
            title: 'idempotencyKey: empty',
            body: { idempotencyKey: '' },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property idempotencyKey is invalid',
                    issues: [{ type: 'item', path: ['idempotencyKey'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'idempotencyKey: 256 characters',
            body: { idempotencyKey: chars(256) },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property idempotencyKey is invalid',
                    issues: [{ type: 'item', path: ['idempotencyKey'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'idempotencyKey: a NUL',
            body: { idempotencyKey: NUL },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property idempotencyKey is invalid',
                    issues: [{ type: 'item', path: ['idempotencyKey'], message: 'must not contain a NUL character', code: 'value_invalid', received: 'a\0b', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'address: a number',
            body: { address: 5 },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property address is invalid',
                    issues: [{ type: 'item', path: ['address'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 5, meta: { optional: true } }],
                },
            },
        },
        {
            title: 'address: empty',
            body: { address: '' },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property address is invalid',
                    issues: [{ type: 'item', path: ['address'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'address: 256 characters',
            body: { address: chars(256) },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property address is invalid',
                    issues: [{ type: 'item', path: ['address'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'address: a NUL',
            body: { address: NUL },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property address is invalid',
                    issues: [{ type: 'item', path: ['address'], message: 'must not contain a NUL character', code: 'value_invalid', received: 'a\0b', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: a string',
            body: { attachments: 'x' },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments is invalid',
                    issues: [{ type: 'item', path: ['attachments'], message: 'must be an array of at most 16 items', code: 'value_invalid', received: 'x', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: an object',
            body: { attachments: {} },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments is invalid',
                    issues: [{ type: 'item', path: ['attachments'], message: 'must be an array of at most 16 items', code: 'value_invalid', received: {}, meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: null',
            body: { attachments: null },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments is invalid',
                    issues: [{ type: 'item', path: ['attachments'], message: 'must be an array of at most 16 items', code: 'value_invalid', received: null, meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: 17 items',
            body: { attachments: Array.from({ length: 17 }, () => ATTACHMENT) },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments is invalid',
                    issues: [{ type: 'item', path: ['attachments'], message: 'must be an array of at most 16 items', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: an item that is a string',
            body: { attachments: ['x'] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property attachments is invalid',
                            data: { name: 'attachments' },
                            path: ['attachments'],
                            issues: [
                                {
                                    type: 'item',
                                    path: ['attachments', 0, 'mediaType'],
                                    message: 'must be a media type of the form type/subtype',
                                    code: 'value_invalid',
                                    meta: { optional: true },
                                },
                                { type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } },
                            ],
                            meta: { optional: true },
                        },
                    ],
                },
            },
        },
        {
            title: 'attachments: an empty item',
            body: { attachments: [{}] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property attachments is invalid',
                            data: { name: 'attachments' },
                            path: ['attachments'],
                            issues: [
                                {
                                    type: 'item',
                                    path: ['attachments', 0, 'mediaType'],
                                    message: 'must be a media type of the form type/subtype',
                                    code: 'value_invalid',
                                    meta: { optional: true },
                                },
                                { type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } },
                            ],
                            meta: { optional: true },
                        },
                    ],
                },
            },
        },
        {
            title: 'attachments: a missing mediaType',
            body: { attachments: [{ data: 'aGk=' }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].mediaType is invalid',
                    issues: [{ type: 'item', path: ['attachments', 0, 'mediaType'], message: 'must be a media type of the form type/subtype', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: a missing data',
            body: { attachments: [{ mediaType: 'text/plain' }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].data is invalid',
                    issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: a mediaType that is a number',
            body: { attachments: [{ ...ATTACHMENT, mediaType: 1 }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].mediaType is invalid',
                    issues: [
                        {
                            type: 'item',
                            path: ['attachments', 0, 'mediaType'],
                            message: 'must be a media type of the form type/subtype',
                            code: 'value_invalid',
                            received: 1,
                            meta: { optional: true },
                        },
                    ],
                },
            },
        },
        {
            title: 'attachments: a mediaType without a subtype',
            body: { attachments: [{ ...ATTACHMENT, mediaType: 'text' }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].mediaType is invalid',
                    issues: [
                        {
                            type: 'item',
                            path: ['attachments', 0, 'mediaType'],
                            message: 'must be a media type of the form type/subtype',
                            code: 'value_invalid',
                            received: 'text',
                            meta: { optional: true },
                        },
                    ],
                },
            },
        },
        {
            title: 'attachments: a mediaType with parameters',
            body: { attachments: [{ ...ATTACHMENT, mediaType: 'text/plain; charset=utf-8' }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].mediaType is invalid',
                    issues: [
                        {
                            type: 'item',
                            path: ['attachments', 0, 'mediaType'],
                            message: 'must be a media type of the form type/subtype',
                            code: 'value_invalid',
                            received: 'text/plain; charset=utf-8',
                            meta: { optional: true },
                        },
                    ],
                },
            },
        },
        {
            title: 'attachments: a filename that is a number',
            body: { attachments: [{ ...ATTACHMENT, filename: 1 }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].filename is invalid',
                    issues: [{ type: 'item', path: ['attachments', 0, 'filename'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 1, meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: an empty filename',
            body: { attachments: [{ ...ATTACHMENT, filename: '' }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].filename is invalid',
                    issues: [
                        {
                            type: 'item',
                            path: ['attachments', 0, 'filename'],
                            message: 'must be a string of 1 to 255 characters',
                            code: 'value_invalid',
                            received: '',
                            meta: { optional: true },
                        },
                    ],
                },
            },
        },
        {
            title: 'attachments: a filename of 256 characters',
            body: { attachments: [{ ...ATTACHMENT, filename: chars(256) }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].filename is invalid',
                    issues: [{ type: 'item', path: ['attachments', 0, 'filename'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: a filename with a NUL',
            body: { attachments: [{ ...ATTACHMENT, filename: NUL }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].filename is invalid',
                    issues: [{ type: 'item', path: ['attachments', 0, 'filename'], message: 'must not contain a NUL character', code: 'value_invalid', received: 'a\0b', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: data that is a number',
            body: { attachments: [{ ...ATTACHMENT, data: 1 }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].data is invalid',
                    issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: data that is no base64',
            body: { attachments: [{ ...ATTACHMENT, data: 'not base64!' }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].data is invalid',
                    issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: unpadded base64',
            body: { attachments: [{ ...ATTACHMENT, data: 'aGk' }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].data is invalid',
                    issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: base64 with non-zero pad bits',
            body: { attachments: [{ ...ATTACHMENT, data: 'aGl=' }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].data is invalid',
                    issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: url-safe base64',
            body: { attachments: [{ ...ATTACHMENT, data: 'a-k=' }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].data is invalid',
                    issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: issues of two items carry their index',
            body: { attachments: [ATTACHMENT, { ...ATTACHMENT, mediaType: 1 }, { ...ATTACHMENT, data: 2 }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property attachments is invalid',
                            data: { name: 'attachments' },
                            path: ['attachments'],
                            issues: [
                                {
                                    type: 'item',
                                    path: ['attachments', 1, 'mediaType'],
                                    message: 'must be a media type of the form type/subtype',
                                    code: 'value_invalid',
                                    received: 1,
                                    meta: { optional: true },
                                },
                                { type: 'item', path: ['attachments', 2, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } },
                            ],
                            meta: { optional: true },
                        },
                    ],
                },
            },
        },
        {
            title: 'reports a field issue per field',
            body: { idempotencyKey: 5, address: '' },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Properties idempotencyKey, address are invalid.',
                    issues: [
                        { type: 'item', path: ['idempotencyKey'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 5, meta: { optional: true } },
                        { type: 'item', path: ['address'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '', meta: { optional: true } },
                    ],
                },
            },
        },
        {
            title: 'reports non-zero pad bits together with the other field issues',
            body: { address: '', attachments: [{ ...ATTACHMENT, data: 'aGl=' }, ATTACHMENT, { ...ATTACHMENT, data: 'aR==' }] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Properties address, attachments are invalid.',
                    issues: [
                        { type: 'item', path: ['address'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '', meta: { optional: true } },
                        {
                            type: 'group',
                            message: 'Property attachments is invalid',
                            data: { name: 'attachments' },
                            path: ['attachments'],
                            issues: [
                                { type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } },
                                { type: 'item', path: ['attachments', 2, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } },
                            ],
                            meta: { optional: true },
                        },
                    ],
                },
            },
        },
    ];

    /* eslint-enable @stylistic/object-curly-newline */
    describe('what a valid start stores', () => {
        it('hands the fields on untouched: no trim, no coercion', async () => {
            const { app, store } = createRunTestApp();
            const response = await call(app, 'POST', '/agents/echo/runs', {
                token: ADMIN_TOKEN,
                body: {
                    payload: { a: [1, null], b: '  x  ' },
                    idempotencyKey: ' key ',
                    address: ' addr ',
                    attachments: [
                        {
                            mediaType: 'text/plain',
                            filename: ' f.txt ',
                            data: 'aGk=',
                        },
                        { mediaType: 'image/png', data: 'AAEC' },
                    ],
                    unknown: 'dropped',
                },
            });

            expect(response.status).toBe(202);

            const { runId } = await response.json() as { runId: string };
            const run = await store.runService.findOneOrFail(runId);

            expect(run.trigger).toMatchObject({
                agent: 'echo',
                trigger: 'http',
                channel: 'http',
                payload: { a: [1, null], b: '  x  ' },
                idempotencyKey: ' key ',
                address: ' addr ',
                attachments: [
                    {
                        id: expect.any(String),
                        mediaType: 'text/plain',
                        filename: ' f.txt ',
                        size: 2,
                    },
                    {
                        id: expect.any(String),
                        mediaType: 'image/png',
                        size: 3,
                    },
                ],
            });
            expect(run.trigger).not.toHaveProperty('unknown');

            const stored = await store.artifactService.find(runId);

            expect(stored.map((a) => a.mediaType)).toEqual(['text/plain', 'image/png']);
            expect(new TextDecoder().decode(await store.artifactService.read(stored[0]!.id))).toBe('hi');
            expect(Array.from((await store.artifactService.read(stored[1]!.id))!)).toEqual([0, 1, 2]);
        });

        it('stores no payload, key, address or attachment for an empty body', async () => {
            const { app, store } = createRunTestApp();
            const { runId } = await (await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, body: {} })).json() as { runId: string };
            const { trigger } = await store.runService.findOneOrFail(runId);

            expect(trigger.payload).toBeUndefined();
            expect(trigger.idempotencyKey).toBeUndefined();
            expect(trigger.address).toBeUndefined();
            expect(trigger.attachments).toBeUndefined();
        });
    });

    const ctx = createRunTestApp();

    it.each(rows)('$title', async ({ body, expected }) => {
        await verify(await call(ctx.app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, body }), expected);
    });
});

describe('POST /runs/:id/approve (the approval answer)', () => {
    async function pausedGate() {
        const ctx = createRunTestApp();
        const started = await call(ctx.app, 'POST', '/agents/gate/runs', { token: ADMIN_TOKEN });
        const { runId } = await started.json() as { runId: string };

        await ctx.engine.start();
        await ctx.engine.idle();

        return {
            ...ctx,
            runId,
            approvalId: approvalWaitOf(await ctx.store.runService.findOne(runId)).approvalId,
        };
    }

    /* eslint-disable @stylistic/object-curly-newline -- one issue per line keeps the pinned wire readable */
    const rows: Row[] = [
        {
            title: 'refuses an empty body',
            body: {},
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Properties approvalId, approved are invalid.',
                    issues: [
                        { type: 'item', path: ['approvalId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' },
                        { type: 'item', path: ['approved'], message: 'must be a boolean', code: 'value_invalid' },
                    ],
                },
            },
        },
        {
            title: 'refuses an array body',
            body: [1],
            expected: { status: 400, body: { status: 400, code: 'bad_request', message: 'The request body must be a JSON object.' } },
        },
        {
            title: 'approvalId: missing',
            body: { approved: true },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property approvalId is invalid',
                    issues: [{ type: 'item', path: ['approvalId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' }],
                },
            },
        },
        {
            title: 'approvalId: a number',
            body: { approvalId: 1, approved: true },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property approvalId is invalid',
                    issues: [{ type: 'item', path: ['approvalId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 1 }],
                },
            },
        },
        {
            title: 'approvalId: empty',
            body: { approvalId: '', approved: true },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property approvalId is invalid',
                    issues: [{ type: 'item', path: ['approvalId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '' }],
                },
            },
        },
        {
            title: 'approvalId: 256 characters',
            body: { approvalId: chars(256), approved: true },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property approvalId is invalid',
                    issues: [{ type: 'item', path: ['approvalId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' }],
                },
            },
        },
        {
            title: 'approvalId: a NUL',
            body: { approvalId: NUL, approved: true },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property approvalId is invalid',
                    issues: [{ type: 'item', path: ['approvalId'], message: 'must not contain a NUL character', code: 'value_invalid', received: 'a\0b' }],
                },
            },
        },
        {
            title: 'approved: missing',
            body: { approvalId: '0:x:0' },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property approved is invalid',
                    issues: [{ type: 'item', path: ['approved'], message: 'must be a boolean', code: 'value_invalid' }],
                },
            },
        },
        {
            title: 'approved: a string',
            body: { approvalId: '0:x:0', approved: 'true' },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property approved is invalid',
                    issues: [{ type: 'item', path: ['approved'], message: 'must be a boolean', code: 'value_invalid', received: 'true' }],
                },
            },
        },
        {
            title: 'approved: a number',
            body: { approvalId: '0:x:0', approved: 1 },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property approved is invalid',
                    issues: [{ type: 'item', path: ['approved'], message: 'must be a boolean', code: 'value_invalid', received: 1 }],
                },
            },
        },
        {
            title: 'reason: a number',
            body: { approvalId: '0:x:0', approved: true, reason: 1 },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property reason is invalid',
                    issues: [{ type: 'item', path: ['reason'], message: 'must be a string of 0 to 1000 characters', code: 'value_invalid', received: 1, meta: { optional: true } }],
                },
            },
        },
        {
            title: 'reason: null',
            body: { approvalId: '0:x:0', approved: true, reason: null },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property reason is invalid',
                    issues: [{ type: 'item', path: ['reason'], message: 'must be a string of 0 to 1000 characters', code: 'value_invalid', received: null, meta: { optional: true } }],
                },
            },
        },
        {
            title: 'reason: 1001 characters',
            body: { approvalId: '0:x:0', approved: true, reason: chars(1001) },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property reason is invalid',
                    issues: [{ type: 'item', path: ['reason'], message: 'must be a string of 0 to 1000 characters', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'reason: a NUL',
            body: { approvalId: '0:x:0', approved: true, reason: NUL },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property reason is invalid',
                    issues: [{ type: 'item', path: ['reason'], message: 'must not contain a NUL character', code: 'value_invalid', received: 'a\0b', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'selected: a string',
            body: { approvalId: '0:x:0', approved: true, selected: 'a' },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property selected is invalid',
                    issues: [{ type: 'item', path: ['selected'], message: 'must be an array of at most 20 strings', code: 'value_invalid', received: 'a', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'selected: null',
            body: { approvalId: '0:x:0', approved: true, selected: null },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property selected is invalid',
                    issues: [{ type: 'item', path: ['selected'], message: 'must be an array of at most 20 strings', code: 'value_invalid', received: null, meta: { optional: true } }],
                },
            },
        },
        {
            title: 'selected: 21 ids',
            body: { approvalId: '0:x:0', approved: true, selected: Array.from({ length: 21 }, (_, i) => `o${i}`) },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property selected is invalid',
                    issues: [
                        {
                            type: 'item',
                            path: ['selected'],
                            message: 'must be an array of at most 20 strings',
                            code: 'value_invalid',
                            received: ['o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8', 'o9', 'o10', 'o11', 'o12', 'o13', 'o14', 'o15', 'o16', 'o17', 'o18', 'o19', 'o20'],
                            meta: { optional: true },
                        },
                    ],
                },
            },
        },
        {
            title: 'selected: an id that is a number',
            body: { approvalId: '0:x:0', approved: true, selected: ['a', 1] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property selected[1] is invalid',
                    issues: [{ type: 'item', path: ['selected', 1], message: 'must be a string of 1 to 128 characters', code: 'value_invalid', received: 1, meta: { optional: true } }],
                },
            },
        },
        {
            title: 'selected: an empty id',
            body: { approvalId: '0:x:0', approved: true, selected: ['a', ''] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property selected[1] is invalid',
                    issues: [{ type: 'item', path: ['selected', 1], message: 'must be a string of 1 to 128 characters', code: 'value_invalid', received: '', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'selected: an id of 129 characters',
            body: { approvalId: '0:x:0', approved: true, selected: [chars(129)] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property selected[0] is invalid',
                    issues: [
                        {
                            type: 'item',
                            path: ['selected', 0],
                            message: 'must be a string of 1 to 128 characters',
                            code: 'value_invalid',
                            received: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                            meta: { optional: true },
                        },
                    ],
                },
            },
        },
        {
            title: 'selected: an id with a NUL',
            body: { approvalId: '0:x:0', approved: true, selected: [NUL] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property selected[0] is invalid',
                    issues: [{ type: 'item', path: ['selected', 0], message: 'must not contain a NUL character', code: 'value_invalid', received: 'a\0b', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'selected: issues of two ids carry their index',
            body: { approvalId: '0:x:0', approved: true, selected: ['', 'a', 5] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property selected is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property selected is invalid',
                            data: { name: 'selected' },
                            path: ['selected'],
                            issues: [
                                { type: 'item', path: ['selected', 0], message: 'must be a string of 1 to 128 characters', code: 'value_invalid', received: '', meta: { optional: true } },
                                { type: 'item', path: ['selected', 2], message: 'must be a string of 1 to 128 characters', code: 'value_invalid', received: 5, meta: { optional: true } },
                            ],
                            meta: { optional: true },
                        },
                    ],
                },
            },
        },
        {
            title: 'reports every field at once',
            body: { approvalId: 1, approved: 'x', reason: 2, selected: 3 },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Properties approvalId, approved, reason, selected are invalid.',
                    issues: [
                        { type: 'item', path: ['approvalId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 1 },
                        { type: 'item', path: ['approved'], message: 'must be a boolean', code: 'value_invalid', received: 'x' },
                        { type: 'item', path: ['reason'], message: 'must be a string of 0 to 1000 characters', code: 'value_invalid', received: 2, meta: { optional: true } },
                        { type: 'item', path: ['selected'], message: 'must be an array of at most 20 strings', code: 'value_invalid', received: 3, meta: { optional: true } },
                    ],
                },
            },
        },
    ];
    /* eslint-enable @stylistic/object-curly-newline */

    describe('refused', () => {
        let ctx: Awaited<ReturnType<typeof pausedGate>>;

        beforeAll(async () => {
            ctx = await pausedGate();
        });

        it.each(rows)('$title', async ({ body, expected }) => {
            await verify(await call(ctx.app, 'POST', `/runs/${ctx.runId}/approve`, { token: ADMIN_TOKEN, body }), expected);
        });
    });

    describe('what a valid answer stores', () => {
        it.each([
            { reason: ' because ', expected: { approved: false, reason: ' because ' } },
            { reason: '', expected: { approved: false, reason: '' } },
        ])('hands the reason $reason on untouched', async ({ reason, expected }) => {
            const ctx = await pausedGate();
            const response = await call(ctx.app, 'POST', `/runs/${ctx.runId}/approve`, {
                token: ADMIN_TOKEN,
                body: {
                    approvalId: ctx.approvalId,
                    approved: false,
                    reason,
                    unknown: 1,
                },
            });

            expect(response.status).toBe(202);
            expect(await response.json()).toEqual({ runId: ctx.runId, status: 'queued' });
            await ctx.engine.idle();

            const detail = await (await call(ctx.app, 'GET', `/runs/${ctx.runId}`, { token: ADMIN_TOKEN })).json() as {
                steps: Array<{ kind: string; output: unknown }>;
            };

            expect(detail.steps.find((step) => step.kind === 'wait')?.output).toEqual({
                approvalId: ctx.approvalId,
                approver: { id: 'admin', kind: 'token' },
                ...expected,
            });
        });
    });

    describe('accepted', () => {
        it.each([
            {
                title: 'a denial without a reason',
                build: (approvalId: string) => ({ approvalId, approved: false }),
                expected: { status: 202 },
            },
            {
                title: 'an empty reason',
                build: (approvalId: string) => ({
                    approvalId,
                    approved: true,
                    reason: '',
                }),
                expected: { status: 202 },
            },
            {
                title: 'a reason of 1000 characters',
                build: (approvalId: string) => ({
                    approvalId,
                    approved: true,
                    reason: chars(1000),
                }),
                expected: { status: 202 },
            },
            {
                title: 'an approval id of 255 characters passes the container (the run has no such approval)',
                build: () => ({ approvalId: chars(255), approved: true }),
                expected: { status: 409 },
            },
        ])('$title', async ({ build, expected }) => {
            const ctx = await pausedGate();
            const response = await call(ctx.app, 'POST', `/runs/${ctx.runId}/approve`, {
                token: ADMIN_TOKEN,
                body: build(ctx.approvalId),
            });

            await verify(response, expected);
        });
    });
});

describe('POST /agents/:name/runs (the peer start body)', () => {
    const DEV_TOKEN = 'peer-dev-token-0123456789';
    const peerAuth = staticTokens({
        tokens: [{
            value: DEV_TOKEN,
            id: 'peer-dev',
            permissions: [{ permission: { name: Permission.AGENT_RUN } }],
        }],
    });
    const resolver: IPeerResolver = {
        names: () => ['dev'],
        has: (name) => name === 'dev',
        settings: () => ({
            pollMs: 60_000,
            untrusted: false,
            outgoing: true,
        }),
        transport: () => ({
            start: async () => ({ runId: 'unused' }),
            read: async (runId) => ({
                id: runId,
                status: 'running',
                tainted: false,
                usage: { inputTokens: 0, outputTokens: 0 },
            }),
            cancel: async () => {},
            wake: async () => {},
        }),
        recognize: (invoker) => (invoker?.kind === 'token' && invoker.id === 'peer-dev' ? 'dev' : undefined),
        approvalUrl: (ref) => `https://receiver.example/runs/${ref.runId}`,
    };
    const engine = createTestEngine({
        agents: [
            defineModelAgent({
                name: 'worker',
                model: textModel('worked'),
                instructions: 'Work.',
                channels: [agent.on({ role: 'review', from: ['dev/caller'] })],
            }),
        ],
        clock: new ControllableClock(new Date(1_000_000)),
        channels: [...testChannels(), agentChannel()],
        peers: resolver,
        onError: () => {},
    });
    const { app } = createTestApp({ engine, auth: [testAuth, peerAuth] });
    const PARENT = {
        runId: 'caller-run-1',
        agent: 'caller',
        depth: 0,
    };
    const PEER = {
        standIn: 'stand-in-1',
        parent: PARENT,
        taint: true,
        origin: 'Ann',
    };

    function body(patch: Record<string, unknown> = {}, peer: unknown = PEER) {
        return {
            payload: 'hi',
            role: 'review',
            peer,
            ...patch,
        };
    }

    /** A peer object with `patch` over the valid one (`undefined` leaves a key out). */
    function peerWith(patch: Record<string, unknown>) {
        return { ...PEER, ...patch };
    }

    function parentWith(patch: Record<string, unknown>) {
        return peerWith({ parent: { ...PARENT, ...patch } });
    }

    /* eslint-disable @stylistic/object-curly-newline -- one issue per line keeps the pinned wire readable */
    const rows: Row[] = [
        {
            title: 'accepts a start',
            body: body({ idempotencyKey: 'ok-1' }),
            expected: { status: 202 },
        },
        {
            title: 'accepts every field at its bound',
            body: body(
                {
                    idempotencyKey: chars(255),
                    address: chars(255),
                    attachments: [{ mediaType: 'text/plain', data: 'aGk=' }],
                },
                {
                    standIn: chars(255),
                    parent: { runId: chars(255), agent: 'caller', depth: 1 },
                    taint: false,
                    origin: chars(128),
                },
            ),
            expected: { status: 400, body: { status: 400, code: 'validation_error', message: 'Agent "worker" role "review" accepts dispatches up to depth 1.' } },
        },
        {
            title: 'accepts a role of 64 characters past the container (the agent has no such role)',
            body: body({ role: chars(64) }),
            expected: {
                status: 400,
                body: { status: 400, code: 'validation_error', message: 'Agent "worker" has no dispatch role "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".' },
            },
        },
        {
            title: 'an empty body: role and peer are required',
            body: {},
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Properties role, peer are invalid.',
                    issues: [
                        { type: 'item', path: ['role'], message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters', code: 'value_invalid' },
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                { type: 'item', path: ['peer', 'standIn'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' },
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [
                                        { type: 'item', path: ['peer', 'parent', 'runId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' },
                                        {
                                            type: 'item',
                                            path: ['peer', 'parent', 'agent'],
                                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                                            code: 'value_invalid',
                                        },
                                        { type: 'item', path: ['peer', 'parent', 'depth'], message: 'must be an integer from 0 to 8', code: 'value_invalid' },
                                    ],
                                },
                                { type: 'item', path: ['peer', 'taint'], message: 'must be a boolean', code: 'value_invalid' },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'role: missing',
            body: body({ role: undefined }),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property role is invalid',
                    issues: [{ type: 'item', path: ['role'], message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters', code: 'value_invalid' }],
                },
            },
        },
        {
            title: 'role: a number',
            body: body({ role: 1 }),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property role is invalid',
                    issues: [
                        {
                            type: 'item',
                            path: ['role'],
                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                            code: 'value_invalid',
                            received: 1,
                        },
                    ],
                },
            },
        },
        {
            title: 'role: not a name',
            body: body({ role: 'Review Me' }),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property role is invalid',
                    issues: [
                        {
                            type: 'item',
                            path: ['role'],
                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                            code: 'value_invalid',
                            received: 'Review Me',
                        },
                    ],
                },
            },
        },
        {
            title: 'role: 65 characters',
            body: body({ role: chars(65) }),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property role is invalid',
                    issues: [
                        {
                            type: 'item',
                            path: ['role'],
                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                            code: 'value_invalid',
                            received: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                        },
                    ],
                },
            },
        },
        {
            title: 'peer: missing',
            body: body({ peer: undefined }),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                { type: 'item', path: ['peer', 'standIn'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' },
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [
                                        { type: 'item', path: ['peer', 'parent', 'runId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' },
                                        {
                                            type: 'item',
                                            path: ['peer', 'parent', 'agent'],
                                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                                            code: 'value_invalid',
                                        },
                                        { type: 'item', path: ['peer', 'parent', 'depth'], message: 'must be an integer from 0 to 8', code: 'value_invalid' },
                                    ],
                                },
                                { type: 'item', path: ['peer', 'taint'], message: 'must be a boolean', code: 'value_invalid' },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer: a string',
            body: body({}, 'x'),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                { type: 'item', path: ['peer', 'standIn'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' },
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [
                                        { type: 'item', path: ['peer', 'parent', 'runId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' },
                                        {
                                            type: 'item',
                                            path: ['peer', 'parent', 'agent'],
                                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                                            code: 'value_invalid',
                                        },
                                        { type: 'item', path: ['peer', 'parent', 'depth'], message: 'must be an integer from 0 to 8', code: 'value_invalid' },
                                    ],
                                },
                                { type: 'item', path: ['peer', 'taint'], message: 'must be a boolean', code: 'value_invalid' },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer: an empty object',
            body: body({}, {}),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                { type: 'item', path: ['peer', 'standIn'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' },
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [
                                        { type: 'item', path: ['peer', 'parent', 'runId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' },
                                        {
                                            type: 'item',
                                            path: ['peer', 'parent', 'agent'],
                                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                                            code: 'value_invalid',
                                        },
                                        { type: 'item', path: ['peer', 'parent', 'depth'], message: 'must be an integer from 0 to 8', code: 'value_invalid' },
                                    ],
                                },
                                { type: 'item', path: ['peer', 'taint'], message: 'must be a boolean', code: 'value_invalid' },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.standIn: missing',
            body: body({}, peerWith({ standIn: undefined })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [{ type: 'item', path: ['peer', 'standIn'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' }],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.standIn: a number',
            body: body({}, peerWith({ standIn: 1 })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [{ type: 'item', path: ['peer', 'standIn'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 1 }],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.standIn: empty',
            body: body({}, peerWith({ standIn: '' })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [{ type: 'item', path: ['peer', 'standIn'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '' }],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.standIn: 256 characters',
            body: body({}, peerWith({ standIn: chars(256) })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [{ type: 'item', path: ['peer', 'standIn'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' }],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.standIn: a NUL',
            body: body({}, peerWith({ standIn: NUL })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [{ type: 'item', path: ['peer', 'standIn'], message: 'must not contain a NUL character', code: 'value_invalid', received: 'a\0b' }],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent: missing',
            body: body({}, peerWith({ parent: undefined })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [
                                        { type: 'item', path: ['peer', 'parent', 'runId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' },
                                        {
                                            type: 'item',
                                            path: ['peer', 'parent', 'agent'],
                                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                                            code: 'value_invalid',
                                        },
                                        { type: 'item', path: ['peer', 'parent', 'depth'], message: 'must be an integer from 0 to 8', code: 'value_invalid' },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent: a string',
            body: body({}, peerWith({ parent: 'x' })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [
                                        { type: 'item', path: ['peer', 'parent', 'runId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' },
                                        {
                                            type: 'item',
                                            path: ['peer', 'parent', 'agent'],
                                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                                            code: 'value_invalid',
                                        },
                                        { type: 'item', path: ['peer', 'parent', 'depth'], message: 'must be an integer from 0 to 8', code: 'value_invalid' },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent: an empty object',
            body: body({}, peerWith({ parent: {} })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [
                                        { type: 'item', path: ['peer', 'parent', 'runId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' },
                                        {
                                            type: 'item',
                                            path: ['peer', 'parent', 'agent'],
                                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                                            code: 'value_invalid',
                                        },
                                        { type: 'item', path: ['peer', 'parent', 'depth'], message: 'must be an integer from 0 to 8', code: 'value_invalid' },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent.runId: missing',
            body: body({}, parentWith({ runId: undefined })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [{ type: 'item', path: ['peer', 'parent', 'runId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' }],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent.runId: empty',
            body: body({}, parentWith({ runId: '' })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [{ type: 'item', path: ['peer', 'parent', 'runId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '' }],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent.runId: 256 characters',
            body: body({}, parentWith({ runId: chars(256) })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [{ type: 'item', path: ['peer', 'parent', 'runId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' }],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent.runId: a NUL',
            body: body({}, parentWith({ runId: NUL })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [{ type: 'item', path: ['peer', 'parent', 'runId'], message: 'must not contain a NUL character', code: 'value_invalid', received: 'a\0b' }],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent.agent: missing',
            body: body({}, parentWith({ agent: undefined })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [
                                        {
                                            type: 'item',
                                            path: ['peer', 'parent', 'agent'],
                                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                                            code: 'value_invalid',
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent.agent: not a name',
            body: body({}, parentWith({ agent: 'Caller' })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [
                                        {
                                            type: 'item',
                                            path: ['peer', 'parent', 'agent'],
                                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                                            code: 'value_invalid',
                                            received: 'Caller',
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent.agent: 65 characters',
            body: body({}, parentWith({ agent: chars(65) })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [
                                        {
                                            type: 'item',
                                            path: ['peer', 'parent', 'agent'],
                                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                                            code: 'value_invalid',
                                            received: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent.depth: missing',
            body: body({}, parentWith({ depth: undefined })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [{ type: 'item', path: ['peer', 'parent', 'depth'], message: 'must be an integer from 0 to 8', code: 'value_invalid' }],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent.depth: -1',
            body: body({}, parentWith({ depth: -1 })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [{ type: 'item', path: ['peer', 'parent', 'depth'], message: 'must be an integer from 0 to 8', code: 'value_invalid', received: -1 }],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent.depth: 9',
            body: body({}, parentWith({ depth: 9 })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [{ type: 'item', path: ['peer', 'parent', 'depth'], message: 'must be an integer from 0 to 8', code: 'value_invalid', received: 9 }],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent.depth: 1.5',
            body: body({}, parentWith({ depth: 1.5 })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [{ type: 'item', path: ['peer', 'parent', 'depth'], message: 'must be an integer from 0 to 8', code: 'value_invalid', received: 1.5 }],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.parent.depth: a string',
            body: body({}, parentWith({ depth: '1' })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [{ type: 'item', path: ['peer', 'parent', 'depth'], message: 'must be an integer from 0 to 8', code: 'value_invalid', received: '1' }],
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.taint: missing',
            body: body({}, peerWith({ taint: undefined })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [{ type: 'item', path: ['peer', 'taint'], message: 'must be a boolean', code: 'value_invalid' }],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.taint: a string',
            body: body({}, peerWith({ taint: 'yes' })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [{ type: 'item', path: ['peer', 'taint'], message: 'must be a boolean', code: 'value_invalid', received: 'yes' }],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.origin: a number',
            body: body({}, peerWith({ origin: 1 })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [{ type: 'item', path: ['peer', 'origin'], message: 'must be a string of 1 to 128 characters', code: 'value_invalid', received: 1, meta: { optional: true } }],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.origin: empty',
            body: body({}, peerWith({ origin: '' })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [{ type: 'item', path: ['peer', 'origin'], message: 'must be a string of 1 to 128 characters', code: 'value_invalid', received: '', meta: { optional: true } }],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.origin: 129 characters',
            body: body({}, peerWith({ origin: chars(129) })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                {
                                    type: 'item',
                                    path: ['peer', 'origin'],
                                    message: 'must be a string of 1 to 128 characters',
                                    code: 'value_invalid',
                                    received: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                                    meta: { optional: true },
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            title: 'peer.origin: a NUL',
            body: body({}, peerWith({ origin: NUL })),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property peer is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [{ type: 'item', path: ['peer', 'origin'], message: 'must not contain a NUL character', code: 'value_invalid', received: 'a\0b', meta: { optional: true } }],
                        },
                    ],
                },
            },
        },
        {
            title: 'idempotencyKey: 256 characters',
            body: body({ idempotencyKey: chars(256) }),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property idempotencyKey is invalid',
                    issues: [{ type: 'item', path: ['idempotencyKey'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'address: a NUL',
            body: body({ address: NUL }),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property address is invalid',
                    issues: [{ type: 'item', path: ['address'], message: 'must not contain a NUL character', code: 'value_invalid', received: 'a\0b', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'attachments: an item with a bad data',
            body: body({ attachments: [{ mediaType: 'text/plain', data: 'x' }] }),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property attachments[0].data is invalid',
                    issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'reports the issues of the nested objects with their path',
            body: body({ role: 1 }, { standIn: '', parent: { runId: 1, agent: 'X', depth: -1 }, taint: 1 }),
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Properties role, peer are invalid.',
                    issues: [
                        {
                            type: 'item',
                            path: ['role'],
                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                            code: 'value_invalid',
                            received: 1,
                        },
                        {
                            type: 'group',
                            message: 'Property peer is invalid',
                            data: { name: 'peer' },
                            path: ['peer'],
                            issues: [
                                { type: 'item', path: ['peer', 'standIn'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '' },
                                {
                                    type: 'group',
                                    message: 'Property parent is invalid',
                                    data: { name: 'parent' },
                                    path: ['peer', 'parent'],
                                    issues: [
                                        { type: 'item', path: ['peer', 'parent', 'runId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 1 },
                                        {
                                            type: 'item',
                                            path: ['peer', 'parent', 'agent'],
                                            message: 'must be lowercase letters and digits in words joined by single hyphens, at most 64 characters',
                                            code: 'value_invalid',
                                            received: 'X',
                                        },
                                        { type: 'item', path: ['peer', 'parent', 'depth'], message: 'must be an integer from 0 to 8', code: 'value_invalid', received: -1 },
                                    ],
                                },
                                { type: 'item', path: ['peer', 'taint'], message: 'must be a boolean', code: 'value_invalid', received: 1 },
                            ],
                        },
                    ],
                },
            },
        },
    ];
    /* eslint-enable @stylistic/object-curly-newline */

    it('hands a valid start on untouched', async () => {
        const response = await call(app, 'POST', '/agents/worker/runs', {
            token: DEV_TOKEN,
            body: body({ idempotencyKey: ' call ', address: ' addr ' }, { ...PEER, origin: ' Ann ' }),
        });

        expect(response.status).toBe(202);

        const { runId } = await response.json() as { runId: string };
        const run = await engine.runService.findOneOrFail(runId);

        expect(run.trigger).toMatchObject({
            channel: 'agent',
            trigger: 'review',
            payload: 'hi',
            idempotencyKey: 'peer: call ',
            address: ' addr ',
            parent: {
                kind: 'peer',
                peer: 'dev',
                runId: 'caller-run-1',
                standIn: 'stand-in-1',
                agent: 'caller',
                role: 'review',
                depth: 1,
                origin: ' Ann ',
            },
        });
        expect(run.taint?.source).toBe('peer:dev');
    });

    it.each(rows)('$title', async ({ body: payload, expected }) => {
        await verify(await call(app, 'POST', '/agents/worker/runs', { token: DEV_TOKEN, body: payload }), expected);
    });
});

describe('POST /authorization/check', () => {
    /* eslint-disable @stylistic/object-curly-newline -- one issue per line keeps the pinned wire readable */
    const rows: Row[] = [
        {
            title: 'accepts no names',
            body: {},
            expected: { status: 200 },
        },
        {
            title: 'accepts an empty list',
            body: { names: [] },
            expected: { status: 200 },
        },
        {
            title: 'accepts a name',
            body: { names: ['chamvi_run_read'] },
            expected: { status: 200 },
        },
        {
            title: 'accepts 64 names of 255 characters',
            body: { names: Array.from({ length: 64 }, (_, i) => `${String(i).padStart(2, '0')}${chars(253)}`) },
            expected: { status: 200 },
        },
        {
            title: 'refuses an array body',
            body: [1],
            expected: { status: 400, body: { status: 400, code: 'bad_request', message: 'The request body must be a JSON object.' } },
        },
        {
            title: 'names: a string',
            body: { names: 'chamvi_run_read' },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property names is invalid',
                    issues: [{ type: 'item', path: ['names'], message: 'must be an array of at most 64 strings', code: 'value_invalid', received: 'chamvi_run_read', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'names: null',
            body: { names: null },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property names is invalid',
                    issues: [{ type: 'item', path: ['names'], message: 'must be an array of at most 64 strings', code: 'value_invalid', received: null, meta: { optional: true } }],
                },
            },
        },
        {
            title: 'names: 65 names',
            body: { names: Array.from({ length: 65 }, (_, i) => `n${i}`) },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property names is invalid',
                    issues: [{ type: 'item', path: ['names'], message: 'must be an array of at most 64 strings', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'names: a name that is a number',
            body: { names: ['a', 1] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property names[1] is invalid',
                    issues: [{ type: 'item', path: ['names', 1], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 1, meta: { optional: true } }],
                },
            },
        },
        {
            title: 'names: an empty name',
            body: { names: [''] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property names[0] is invalid',
                    issues: [{ type: 'item', path: ['names', 0], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'names: a name of 256 characters',
            body: { names: [chars(256)] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property names[0] is invalid',
                    issues: [{ type: 'item', path: ['names', 0], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'names: a name with a NUL',
            body: { names: [NUL] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property names[0] is invalid',
                    issues: [{ type: 'item', path: ['names', 0], message: 'must not contain a NUL character', code: 'value_invalid', received: 'a\0b', meta: { optional: true } }],
                },
            },
        },
        {
            title: 'names: issues of two names carry their index',
            body: { names: ['', 'a', 7] },
            expected: {
                status: 400,
                body: {
                    status: 400,
                    code: 'validation_error',
                    message: 'Property names is invalid',
                    issues: [
                        {
                            type: 'group',
                            message: 'Property names is invalid',
                            data: { name: 'names' },
                            path: ['names'],
                            issues: [
                                { type: 'item', path: ['names', 0], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '', meta: { optional: true } },
                                { type: 'item', path: ['names', 2], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 7, meta: { optional: true } },
                            ],
                            meta: { optional: true },
                        },
                    ],
                },
            },
        },
    ];

    /* eslint-enable @stylistic/object-curly-newline */
    describe('what a valid check answers', () => {
        const check = async (body: unknown) => (await call(createRunTestApp().app, 'POST', '/authorization/check', { token: ADMIN_TOKEN, body })).json();

        it('answers the granted names, each once, in the order sent', async () => {
            expect(await check({ names: ['chamvi_run_read', 'chamvi_agent_run', 'chamvi_run_read', 'unknown'] })).toEqual({ permissions: ['chamvi_run_read', 'chamvi_agent_run'] });
        });

        it('answers nothing for an empty list and every permission for no names', async () => {
            expect(await check({ names: [] })).toEqual({ permissions: [] });
            expect(await check({})).toEqual({ permissions: [...PERMISSION_NAMES] });
        });
    });

    const ctx = createRunTestApp();

    it.each(rows)('$title', async ({ body, expected }) => {
        await verify(await call(ctx.app, 'POST', '/authorization/check', { token: ADMIN_TOKEN, body }), expected);
    });
});

describe('PATCH /agents/:name/state/kv/:key', () => {
    /* eslint-disable @stylistic/object-curly-newline -- one issue per line keeps the pinned wire readable */
    const rows: Row[] = [
        {
            title: 'accepts a value',
            body: { value: { a: 1 } },
            expected: { status: 200 },
        },
        {
            title: 'accepts a null value',
            body: { value: null },
            expected: { status: 200 },
        },
        {
            title: 'accepts a falsy value',
            body: { value: 0 },
            expected: { status: 200 },
        },
        {
            title: 'value: missing',
            body: {},
            expected: {
                status: 400,
                body: { status: 400, code: 'validation_error', message: 'Property value is invalid', issues: [{ type: 'item', path: ['value'], message: 'is required', code: 'required' }] },
            },
        },
        {
            title: 'refuses an array body',
            body: [1],
            expected: { status: 400, body: { status: 400, code: 'bad_request', message: 'The request body must be a JSON object.' } },
        },
        {
            title: 'refuses a string body',
            body: 'x',
            expected: { status: 400, body: { status: 400, code: 'bad_request', message: 'The request body must be a JSON object.' } },
        },
        {
            title: 'refuses a null body',
            body: null,
            expected: { status: 400, body: { status: 400, code: 'bad_request', message: 'The request body must be a JSON object.' } },
        },
    ];

    /* eslint-enable @stylistic/object-curly-newline */
    describe('what a valid write stores', () => {
        it.each([
            { value: { a: [1, null], b: '  x  ' } },
            { value: null },
            { value: 0 },
            { value: '' },
            { value: false },
        ])('stores $value as sent', async ({ value }) => {
            const { app, store } = createRunTestApp();
            const response = await call(app, 'PATCH', '/agents/echo/state/kv/k', { token: ADMIN_TOKEN, body: { value, unknown: 1 } });

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ key: 'k', value });
            expect(await store.stateService.findOne('echo', 'k')).toEqual(value);
        });
    });

    const ctx = createRunTestApp();

    it.each(rows)('$title', async ({ body, expected }) => {
        await verify(await call(ctx.app, 'PATCH', '/agents/echo/state/kv/k', { token: ADMIN_TOKEN, body }), expected);
    });
});

describe('connection bodies', () => {
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
                key: 'password',
                label: 'Password',
                kind: 'secret',
                required: true,
            },
        ],
        uniqueId: (values) => String(values.host),
    };
    const SECRET = 'hunter2-plaintext-secret';

    function world() {
        const clock = new ControllableClock(new Date(1_000_000));
        const storage = createTestEngine({ agents: [], clock });
        const provider: IConnectionTypeProvider = {
            definition,
            creatable: () => true,
            connections: () => [],
        };
        const key = randomBytes(32);
        const configs = createConnectionConfigStore({
            connectionService: storage.connectionService!,
            lockService: storage.lockService,
            clock,
            keyring: () => createKeyring([{ id: 'k1', key }]),
        });
        const { app } = createTestApp({
            engine: storage,
            connectionTypes: () => [provider],
            connectionConfigs: configs,
            onError: () => {},
        });

        return { app };
    }

    describe('what a valid create and save store', () => {
        const view = {
            type: 'mail',
            editable: true,
            deletable: true,
            state: 'configured',
            restartRequired: true,
            revision: 1,
            generation: expect.any(String),
        };

        it('answers and stores the values untouched, never a secret', async () => {
            const { app } = world();
            const created = await call(app, 'POST', '/connection-types/mail/connections', {
                token: ADMIN_TOKEN,
                body: {
                    account: 'work',
                    settings: { host: ' h.test ' },
                    secrets: { password: SECRET },
                    unknown: 1,
                },
            });
            const expected = {
                ...view,
                settings: { host: ' h.test ' },
                fields: [
                    { key: 'host', source: { kind: 'store' } },
                    {
                        key: 'password',
                        set: true,
                        source: { kind: 'store' },
                    },
                ],
            };

            expect(created.status).toBe(201);
            expect(await created.json()).toEqual({ name: 'mail-work', ...expected });

            const read = await call(app, 'GET', '/connections/mail-work/config', { token: ADMIN_TOKEN });

            expect(await read.json()).toEqual(expected);
        });

        it('saves the settings and the secrets as sent, then clears a secret', async () => {
            const { app } = world();

            await call(app, 'POST', '/connection-types/mail/connections', {
                token: ADMIN_TOKEN,
                body: {
                    account: 'work',
                    settings: { host: 'h.test' },
                    secrets: { password: SECRET },
                },
            });

            const current = async () => (await (await call(app, 'GET', '/connections/mail-work/config', { token: ADMIN_TOKEN })).json()) as {
                revision: number;
                generation: string;
            };
            const first = await current();
            const saved = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: {
                    revision: first.revision,
                    generation: first.generation,
                    settings: { host: ' h2.test ' },
                    secrets: { set: { password: ` ${SECRET}2 ` } },
                    unknown: 1,
                },
            });
            const expected = {
                ...view,
                revision: 2,
                settings: { host: ' h2.test ' },
                fields: [
                    { key: 'host', source: { kind: 'store' } },
                    {
                        key: 'password',
                        set: true,
                        source: { kind: 'store' },
                    },
                ],
            };

            expect(saved.status).toBe(200);
            expect(await saved.json()).toEqual(expected);
            expect(await current()).toMatchObject({ revision: 2 });

            const second = await current();
            const cleared = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: {
                    revision: second.revision,
                    generation: second.generation,
                    secrets: { clear: ['password'] },
                },
            });

            expect(cleared.status).toBe(200);
            expect(await cleared.json()).toEqual({
                ...expected,
                revision: 3,
                state: 'incomplete',
                missing: ['Password'],
                fields: [
                    { key: 'host', source: { kind: 'store' } },
                    {
                        key: 'password',
                        set: false,
                        source: { kind: 'unset' },
                    },
                ],
            });
        });
    });

    describe('POST /connection-types/:type/connections', () => {
        const account = (patch: Record<string, unknown> = {}) => ({
            account: 'work',
            settings: { host: 'h.test' },
            secrets: { password: SECRET },
            ...patch,
        });
        /* eslint-disable @stylistic/object-curly-newline -- one issue per line keeps the pinned wire readable */
        const rows: Row[] = [
            {
                title: 'accepts an account',
                body: account(),
                expected: { status: 201 },
            },
            {
                title: 'refuses an array body',
                body: [1],
                expected: { status: 400, body: { status: 400, code: 'bad_request', message: 'The request body must be a JSON object.' } },
            },
            {
                title: 'an empty body',
                body: {},
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Properties account, settings are invalid.',
                        issues: [
                            { type: 'item', path: ['account'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid' },
                            { type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid' },
                        ],
                    },
                },
            },
            {
                title: 'account: missing',
                body: account({ account: undefined }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property account is invalid',
                        issues: [{ type: 'item', path: ['account'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'account: a number',
                body: account({ account: 1 }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property account is invalid',
                        issues: [{ type: 'item', path: ['account'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'account: empty',
                body: account({ account: '' }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property account is invalid',
                        issues: [{ type: 'item', path: ['account'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'account: 65 characters',
                body: account({ account: chars(65) }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property account is invalid',
                        issues: [{ type: 'item', path: ['account'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'account: a NUL',
                body: account({ account: NUL }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property account is invalid',
                        issues: [{ type: 'item', path: ['account'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'settings: missing',
                body: account({ settings: undefined }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property settings is invalid',
                        issues: [{ type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'settings: a string',
                body: account({ settings: 'x' }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property settings is invalid',
                        issues: [{ type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'settings: an array',
                body: account({ settings: [] }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property settings is invalid',
                        issues: [{ type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'settings: null',
                body: account({ settings: null }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property settings is invalid',
                        issues: [{ type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'secrets: a string',
                body: account({ secrets: SECRET }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property secrets is invalid',
                        issues: [{ type: 'item', path: ['secrets'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }],
                    },
                },
            },
            {
                title: 'secrets: an array',
                body: account({ secrets: [SECRET] }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property secrets is invalid',
                        issues: [{ type: 'item', path: ['secrets'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }],
                    },
                },
            },
            {
                title: 'secrets: null',
                body: account({ secrets: null }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property secrets is invalid',
                        issues: [{ type: 'item', path: ['secrets'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }],
                    },
                },
            },
        ];
        /* eslint-enable @stylistic/object-curly-newline */
        const ctx = world();

        it.each(rows)('$title', async ({ body, expected }) => {
            await verify(await call(ctx.app, 'POST', '/connection-types/mail/connections', { token: ADMIN_TOKEN, body }), expected);
        });
    });

    describe('PUT /connections/:name/config', () => {
        const ctx = world();

        const save = (patch: Record<string, unknown> = {}) => ({
            revision: 1,
            settings: { host: 'h.test' },
            ...patch,
        });
        /** A save of what the config view reads now, as the dashboard sends it. */
        const saveOfView = (patch: Record<string, unknown>) => async () => {
            const view = await (await call(ctx.app, 'GET', '/connections/mail-work/config', { token: ADMIN_TOKEN })).json() as {
                revision: number;
                generation?: string;
            };

            return {
                revision: view.revision,
                generation: view.generation,
                ...patch,
            };
        };
        /* eslint-disable @stylistic/object-curly-newline -- one issue per line keeps the pinned wire readable */
        const rows: Row[] = [
            {
                title: 'accepts a save of the settings',
                body: saveOfView({ settings: { host: 'h2.test' } }),
                expected: { status: 200 },
            },
            {
                title: 'accepts a save of secrets',
                body: saveOfView({ secrets: { set: { password: SECRET }, clear: [] } }),
                expected: { status: 200 },
            },
            {
                title: 'refuses an array body',
                body: [1],
                expected: { status: 400, body: { status: 400, code: 'bad_request', message: 'The request body must be a JSON object.' } },
            },
            {
                title: 'an empty body',
                body: {},
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property revision is invalid',
                        issues: [{ type: 'item', path: ['revision'], message: 'must be a non-negative integer', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'revision: missing',
                body: save({ revision: undefined }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property revision is invalid',
                        issues: [{ type: 'item', path: ['revision'], message: 'must be a non-negative integer', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'revision: -1',
                body: save({ revision: -1 }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property revision is invalid',
                        issues: [{ type: 'item', path: ['revision'], message: 'must be a non-negative integer', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'revision: 1.5',
                body: save({ revision: 1.5 }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property revision is invalid',
                        issues: [{ type: 'item', path: ['revision'], message: 'must be a non-negative integer', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'revision: a string',
                body: save({ revision: '1' }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property revision is invalid',
                        issues: [{ type: 'item', path: ['revision'], message: 'must be a non-negative integer', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'revision: null',
                body: save({ revision: null }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property revision is invalid',
                        issues: [{ type: 'item', path: ['revision'], message: 'must be a non-negative integer', code: 'value_invalid' }],
                    },
                },
            },
            {
                title: 'generation: a number',
                body: save({ generation: 1 }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property generation is invalid',
                        issues: [{ type: 'item', path: ['generation'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid', meta: { optional: true } }],
                    },
                },
            },
            {
                title: 'generation: empty',
                body: save({ generation: '' }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property generation is invalid',
                        issues: [{ type: 'item', path: ['generation'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid', meta: { optional: true } }],
                    },
                },
            },
            {
                title: 'generation: 65 characters',
                body: save({ generation: chars(65) }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property generation is invalid',
                        issues: [{ type: 'item', path: ['generation'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid', meta: { optional: true } }],
                    },
                },
            },
            {
                title: 'settings: a string',
                body: save({ settings: 'x' }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property settings is invalid',
                        issues: [{ type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }],
                    },
                },
            },
            {
                title: 'settings: an array',
                body: save({ settings: [] }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property settings is invalid',
                        issues: [{ type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }],
                    },
                },
            },
            {
                title: 'secrets: a string',
                body: save({ secrets: SECRET }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property secrets is invalid',
                        issues: [{ type: 'item', path: ['secrets'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }],
                    },
                },
            },
            {
                title: 'secrets: an array',
                body: save({ secrets: [SECRET] }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property secrets is invalid',
                        issues: [{ type: 'item', path: ['secrets'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }],
                    },
                },
            },
            {
                title: 'secrets.set: a string',
                body: save({ secrets: { set: SECRET } }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property secrets is invalid',
                        issues: [{ type: 'item', path: ['secrets'], message: 'set must be an object', code: 'value_invalid', meta: { optional: true } }],
                    },
                },
            },
            {
                title: 'secrets.set: an array',
                body: save({ secrets: { set: [SECRET] } }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property secrets is invalid',
                        issues: [{ type: 'item', path: ['secrets'], message: 'set must be an object', code: 'value_invalid', meta: { optional: true } }],
                    },
                },
            },
            {
                title: 'secrets.clear: a string',
                body: save({ secrets: { clear: 'password' } }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property secrets is invalid',
                        issues: [{ type: 'item', path: ['secrets'], message: 'clear must be an array of field names', code: 'value_invalid', meta: { optional: true } }],
                    },
                },
            },
            {
                title: 'secrets.clear: a list with a number',
                body: save({ secrets: { clear: ['password', 1] } }),
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Property secrets is invalid',
                        issues: [{ type: 'item', path: ['secrets'], message: 'clear must be an array of field names', code: 'value_invalid', meta: { optional: true } }],
                    },
                },
            },
            {
                title: 'reports every field at once',
                body: { revision: 'x', generation: 1, settings: 2, secrets: 3 },
                expected: {
                    status: 400,
                    body: {
                        status: 400,
                        code: 'validation_error',
                        message: 'Properties settings, secrets, revision, generation are invalid.',
                        issues: [
                            { type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } },
                            { type: 'item', path: ['secrets'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } },
                            { type: 'item', path: ['revision'], message: 'must be a non-negative integer', code: 'value_invalid' },
                            { type: 'item', path: ['generation'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid', meta: { optional: true } },
                        ],
                    },
                },
            },
        ];
        /* eslint-enable @stylistic/object-curly-newline */

        beforeAll(async () => {
            const created = await call(ctx.app, 'POST', '/connection-types/mail/connections', {
                token: ADMIN_TOKEN,
                body: {
                    account: 'work',
                    settings: { host: 'seed.test' },
                    secrets: { password: SECRET },
                },
            });

            expect(created.status).toBe(201);
        });

        it.each(rows)('$title', async ({ body, expected }) => {
            await verify(await call(ctx.app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: typeof body === 'function' ? await body() : body,
            }), expected);
        });
    });
});
