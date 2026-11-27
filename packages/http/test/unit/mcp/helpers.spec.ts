/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import {
    DISPATCH_DEPTH_MAX,
    PeerStartBusyError,
} from '@chamvi/core';
import {
    EntityConflictError,
    EntityDeadlockError,
    EntityInvalidError,
    EntityNotFoundError,
    EntityQueryError,
    EntityRelationError,
    ServiceUnavailableError,
} from '@chamvi/errors';
import { BaseError } from '@ebec/core';
import type { Run, WaitPoint } from '@chamvi/core-kit';
import {
    findWaitingApproval,
    isWaitOver,
    runTool,
    toJsonSchema,
    toRunToolResult,
} from '../../../src/mcp/helpers/index.ts';
import { createTestEngine } from '@chamvi/test-kit';
import type { HttpContext } from '../../../src/app/types.ts';

function plainSchema(jsonSchema?: unknown): StandardSchemaV1 {
    return {
        '~standard': {
            version: 1,
            vendor: 'test',
            validate: (value) => ({ value }),
            ...(jsonSchema ? { jsonSchema } : {}),
        },
    } as StandardSchemaV1;
}

describe('toJsonSchema', () => {
    it('converts a schema with a json schema converter, without $schema', () => {
        const schema = toJsonSchema(z.object({ n: z.number() }));

        expect(schema).toMatchObject({ type: 'object', properties: { n: { type: 'number' } } });
        expect(schema).not.toHaveProperty('$schema');
    });

    it('re-roots local refs at the given pointer, leaving data keywords alone', () => {
        const schema = toJsonSchema(plainSchema({
            input: () => ({
                type: 'object',
                properties: {
                    self: { $ref: '#' },
                    node: { $ref: '#/definitions/node' },
                    remote: { $ref: 'https://example.com/schema' },
                    fixed: { const: { $ref: '#' } },
                },
                definitions: { node: { type: 'array', items: { $ref: '#/definitions/node' } } },
            }),
            output: () => ({}),
        }), '#/properties/payload');

        expect(schema).toEqual({
            type: 'object',
            properties: {
                self: { $ref: '#/properties/payload' },
                node: { $ref: '#/properties/payload/definitions/node' },
                remote: { $ref: 'https://example.com/schema' },
                fixed: { const: { $ref: '#' } },
            },
            definitions: { node: { type: 'array', items: { $ref: '#/properties/payload/definitions/node' } } },
        });
    });

    it('is {} without a schema, without a converter, or when the converter throws', () => {
        expect(toJsonSchema(undefined)).toEqual({});
        expect(toJsonSchema(plainSchema())).toEqual({});
        expect(toJsonSchema(plainSchema({
            input: () => {
                throw new Error('unsupported');
            },
            output: () => ({}),
        }))).toEqual({});
    });
});

function buildRun(status: Run['status'], waiting?: WaitPoint, id = 'r1', parentRunId?: string): Run {
    const now = new Date(0);

    return {
        id,
        ...(parentRunId !== undefined ? { parentRunId } : {}),
        agent: 'gate',
        status,
        trigger: {
            id: 't1',
            agent: 'gate',
            trigger: 'mcp',
            channel: 'mcp',
            payload: undefined,
            receivedAt: now,
            ...(parentRunId !== undefined ?
                {
                    parent: {
                        kind: 'dispatch' as const,
                        runId: parentRunId,
                        agent: 'gate',
                        role: 'default',
                        depth: 1,
                    },
                } :
                {}),
        },
        usage: { inputTokens: 0, outputTokens: 0 },
        ...(waiting ? { waiting } : {}),
        createdAt: now,
        updatedAt: now,
    };
}

const DISPATCH_WAIT: WaitPoint = {
    kind: 'dispatch',
    id: '0:c1:w0',
    toolName: 'delegate',
    toolCallId: 'c1',
    runIds: ['c1', 'c2'],
    expiresAt: new Date(1000),
};

const APPROVAL_WAIT: WaitPoint = {
    kind: 'approval',
    id: '0:c1:0',
    approvalId: '0:c1:0',
    toolName: 'deploy',
    toolCallId: 'c1',
    title: 'Deploy?',
    expiresAt: new Date(1000),
};

const REMOTE_WAIT: WaitPoint = {
    kind: 'remote',
    id: 'remote',
    peer: 'dev',
    agent: 'developer',
    remoteRunId: 'remote-1',
    expiresAt: new Date(1000),
};

const REMOTE_APPROVAL_WAIT: WaitPoint = {
    ...REMOTE_WAIT,
    remote: {
        status: 'waiting',
        approval: {
            runId: 'remote-2',
            approvalId: '0:c9:0',
            title: 'Merge?',
            url: 'https://dev.example/ui/approvals?run=remote-2&approval=0%3Ac9%3A0',
            notifiedAt: new Date(500),
        },
    },
};

describe('toRunToolResult', () => {
    it('serializes an approval wait', () => {
        const result = toRunToolResult(buildRun('waiting', APPROVAL_WAIT), false, true);

        expect(result.waiting).toEqual({
            kind: 'approval',
            runId: 'r1',
            agent: 'gate',
            toolName: 'deploy',
            title: 'Deploy?',
            expiresAt: new Date(1000).toISOString(),
        });
    });

    it('serializes a dispatch wait for get_run', () => {
        const result = toRunToolResult(buildRun('waiting', DISPATCH_WAIT), false, true);

        expect(result.status).toBe('waiting');
        expect(result.waiting).toEqual({
            kind: 'dispatch',
            toolName: 'delegate',
            runIds: ['c1', 'c2'],
            expiresAt: new Date(1000).toISOString(),
        });
    });

    it('names the descendant whose approval the run waits behind', () => {
        const child = { ...buildRun('waiting', APPROVAL_WAIT, 'child', 'r1'), agent: 'worker' };
        const result = toRunToolResult(buildRun('waiting', DISPATCH_WAIT), false, true, child);

        expect(result.runId).toBe('r1');
        expect(result.waiting).toEqual({
            kind: 'approval',
            runId: 'child',
            agent: 'worker',
            toolName: 'deploy',
            title: 'Deploy?',
            expiresAt: new Date(1000).toISOString(),
        });
    });

    it('serializes a remote wait, with the approval pending at the peer and its link', () => {
        expect(toRunToolResult(buildRun('waiting', REMOTE_WAIT), false, true).waiting).toEqual({
            kind: 'remote',
            runId: 'r1',
            agent: 'gate',
            peer: 'dev',
            remoteAgent: 'developer',
            remoteRunId: 'remote-1',
            expiresAt: new Date(1000).toISOString(),
        });

        const standIn = { ...buildRun('waiting', REMOTE_APPROVAL_WAIT, 'stand-in', 'r1'), agent: 'developer' };

        expect(toRunToolResult(buildRun('waiting', DISPATCH_WAIT), false, true, standIn).waiting).toEqual({
            kind: 'remote',
            runId: 'stand-in',
            agent: 'developer',
            peer: 'dev',
            remoteAgent: 'developer',
            remoteRunId: 'remote-1',
            expiresAt: new Date(1000).toISOString(),
            approval: {
                runId: 'remote-2',
                approvalId: '0:c9:0',
                title: 'Merge?',
                url: 'https://dev.example/ui/approvals?run=remote-2&approval=0%3Ac9%3A0',
            },
        });
    });

    it('answers only the run id, status and deduplicated when not readable', () => {
        const run = {
            ...buildRun('failed', APPROVAL_WAIT),
            output: 'x',
            error: { code: 'e', message: 'm' },
        };

        expect(toRunToolResult(run, true, false)).toEqual({
            runId: 'r1',
            status: 'failed',
            deduplicated: true,
        });
    });
});

describe('findWaitingApproval', () => {
    function engineOver(runs: Run[]) {
        const engine = createTestEngine({
            agents: [],
            onError: () => {},
        });

        return {
            engine,
            // parents first: a child's insert needs its parent stored
            ready: runs.reduce<Promise<unknown>>((prev, run) => prev.then(() => engine.runService.create(run)), Promise.resolve()),
        };
    }

    it('is the run itself when it waits on an approval', async () => {
        const { engine, ready } = engineOver([buildRun('waiting', APPROVAL_WAIT)]);

        await ready;
        expect((await findWaitingApproval(engine, 'r1'))?.id).toBe('r1');
    });

    it('is a stand-in whose remote run waits on an approval, itself or below a dispatch', async () => {
        const { engine, ready } = engineOver([
            buildRun('waiting', REMOTE_APPROVAL_WAIT),
            buildRun('waiting', DISPATCH_WAIT, 'p1'),
            buildRun('waiting', REMOTE_APPROVAL_WAIT, 's1', 'p1'),
            buildRun('waiting', REMOTE_WAIT, 'quiet'),
        ]);

        await ready;
        expect((await findWaitingApproval(engine, 'r1'))?.id).toBe('r1');
        expect((await findWaitingApproval(engine, 'p1'))?.id).toBe('s1');
        expect(await findWaitingApproval(engine, 'quiet')).toBeUndefined();
    });

    it('finds a waiting grandchild breadth-first, skipping settled children', async () => {
        const { engine, ready } = engineOver([
            buildRun('waiting', DISPATCH_WAIT),
            buildRun('waiting', { ...DISPATCH_WAIT, id: '0:c2:w0' }, 'c1', 'r1'),
            buildRun('completed', undefined, 'c2', 'r1'),
            buildRun('waiting', APPROVAL_WAIT, 'g1', 'c1'),
            buildRun('waiting', APPROVAL_WAIT, 'g2', 'c2'),
        ]);

        await ready;
        expect((await findWaitingApproval(engine, 'r1'))?.id).toBe('g1');
    });

    it('follows the runs of the wait point, also one another run dispatched', async () => {
        // r1 waits on `shared`, a run `other` dispatched (reached through a shared idempotency key)
        const { engine, ready } = engineOver([
            buildRun('waiting', { ...DISPATCH_WAIT, runIds: ['shared'] }),
            buildRun('running', undefined, 'other'),
            buildRun('waiting', APPROVAL_WAIT, 'shared', 'other'),
        ]);

        await ready;
        expect((await findWaitingApproval(engine, 'r1'))?.id).toBe('shared');
    });

    it('ends on wait points that name each other', async () => {
        const { engine, ready } = engineOver([
            buildRun('waiting', { ...DISPATCH_WAIT, runIds: ['x', 'x'] }),
            buildRun('running', undefined, 'other'),
            buildRun('waiting', {
                ...DISPATCH_WAIT,
                id: '0:x:w0',
                runIds: ['r1'],
            }, 'x', 'other'),
        ]);

        await ready;
        expect(await findWaitingApproval(engine, 'r1')).toBeUndefined();
    });

    it('is undefined without an approval wait, for an unknown run and past the depth cap', async () => {
        const chain = Array.from({ length: DISPATCH_DEPTH_MAX + 1 }, (_, i) => buildRun(
            'waiting',
            { ...DISPATCH_WAIT, id: `0:d${i}:w0` },
            `d${i}`,
            i === 0 ? undefined : `d${i - 1}`,
        ));
        const { engine, ready } = engineOver([
            ...chain,
            buildRun('waiting', APPROVAL_WAIT, 'deep', `d${DISPATCH_DEPTH_MAX}`),
        ]);

        await ready;
        expect(await findWaitingApproval(engine, 'd0')).toBeUndefined();
        expect((await findWaitingApproval(engine, 'd1'))?.id).toBe('deep');
        expect(await findWaitingApproval(engine, 'missing')).toBeUndefined();
    });
});

describe('isWaitOver', () => {
    it('is true for a terminal run and an approval wait', () => {
        expect(isWaitOver(buildRun('completed'))).toBe(true);
        expect(isWaitOver(buildRun('failed'))).toBe(true);
        expect(isWaitOver(buildRun('cancelled'))).toBe(true);
        expect(isWaitOver(buildRun('waiting', APPROVAL_WAIT))).toBe(true);
        expect(isWaitOver(buildRun('waiting', REMOTE_APPROVAL_WAIT))).toBe(true);
    });

    it('is false for a dispatch wait and an unsettled run', () => {
        expect(isWaitOver(buildRun('waiting', DISPATCH_WAIT))).toBe(false);
        expect(isWaitOver(buildRun('waiting', REMOTE_WAIT))).toBe(false);
        expect(isWaitOver(buildRun('queued'))).toBe(false);
        expect(isWaitOver(buildRun('running'))).toBe(false);
        expect(isWaitOver(buildRun('interrupted'))).toBe(false);
    });
});

describe('runTool', () => {
    function contextOf(reported: unknown[]): HttpContext {
        return {
            onError: (error: unknown) => {
                reported.push(error);
            },
        } as unknown as HttpContext;
    }

    it('reports a chamvi 5xx and answers Internal Server Error', async () => {
        const reported: unknown[] = [];
        const error = new ServiceUnavailableError({ message: 'The token issuer is unreachable.' });
        const result = await runTool(contextOf(reported), async () => {
            throw error;
        });

        expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'Internal Server Error' }] });
        expect(reported).toEqual([error]);
    });

    it('answers a busy peer start with its message, unreported', async () => {
        const reported: unknown[] = [];
        const error = new PeerStartBusyError('peer-a', 'r1');
        const result = await runTool(contextOf(reported), async () => {
            throw error;
        });

        expect(result).toEqual({ isError: true, content: [{ type: 'text', text: error.message }] });
        expect(reported).toEqual([]);
    });

    it.each([
        ['EntityNotFoundError', () => new EntityNotFoundError({ entity: 'run' })],
        ['EntityConflictError', () => new EntityConflictError({ entity: 'run' })],
        ['EntityRelationError', () => new EntityRelationError({ entity: 'step', relation: 'run' })],
        ['EntityInvalidError', () => new EntityInvalidError({
            entity: 'run',
            operation: 'save',
            field: 'status',
        })],
        ['EntityQueryError', () => new EntityQueryError({ entity: 'run' })],
        ['EntityDeadlockError', () => new EntityDeadlockError({ entity: 'lock' })],
        ['database_unavailable', () => new BaseError({ code: 'database_unavailable', message: 'The database could not complete the connect.' })],
    ])('reports a storage error and answers Internal Server Error (%s)', async (_name, create) => {
        const reported: unknown[] = [];
        const error = create();
        const result = await runTool(contextOf(reported), async () => {
            throw error;
        });

        expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'Internal Server Error' }] });
        expect(reported).toEqual([error]);
    });
});
