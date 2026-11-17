/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission } from '@chamvi/access';
import { defineModelAgent } from '@chamvi/core';
import type { Agent, RunService } from '@chamvi/core';
import type { Run } from '@chamvi/store';
import { http } from '@chamvi/http';
import {
    ADMIN_TOKEN,
    READER_TOKEN,
    call,
    createTestApp,
    cronOn,
    restricted,
    tokenFor,
} from '../../utils/app.ts';
import { callTool, connectMcp } from '../../utils/mcp.ts';
import { textModel } from '../../utils/model.ts';

/*
 * GET /runs answers, byte for byte: every filter, sort and page of the run
 * listing specs and of the http topic, against a fixed set of runs. The
 * snapshot was recorded before the listing moved onto rapiq queries.
 */

function agent(name: string, options: { private?: boolean; cron?: boolean } = {}): Agent {
    return defineModelAgent({
        name,
        model: textModel(),
        instructions: `${name}.`,
        channels: options.cron ? [cronOn('0 * * * *')] : [http.on()],
        ...(options.private ? { private: true } : {}),
    });
}

const id = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const at = (n: number) => new Date(2_000_000 + n * 1000);
const expiresAt = new Date(9_000_000);

type RunFixture = {
    n: number;
    agent: string;
    status: Run['status'];
    /** The createdAt step (ties share one). */
    t: number;
    parent?: number;
    extra?: Partial<Run>;
};

const RUNS: RunFixture[] = [
    {
        n: 1,
        agent: 'echo',
        status: 'completed',
        t: 0,
        extra: {
            output: 'one',
            claim: { owner: 'replica-a', expiresAt },
            finishedAt: at(0),
        },
    },
    {
        n: 2,
        agent: 'gate',
        status: 'waiting',
        t: 1,
        extra: {
            waiting: {
                kind: 'approval',
                id: '0:c1:0',
                approvalId: '0:c1:0',
                toolName: 'deploy',
                toolCallId: 'c1',
                title: 'Deploy?',
                expiresAt,
            },
        },
    },
    {
        n: 3,
        agent: 'echo',
        status: 'waiting',
        t: 2,
        extra: {
            waiting: {
                kind: 'dispatch',
                id: '0:c2:w0',
                toolName: 'fan',
                toolCallId: 'c2',
                runIds: [id(1)],
                expiresAt,
            },
        },
    },
    {
        n: 4,
        agent: 'alfred',
        status: 'completed',
        t: 3,
        extra: { output: 'private' },
    },
    {
        n: 5,
        agent: '007',
        status: 'queued',
        t: 4,
    },
    {
        n: 7,
        agent: 'gate',
        status: 'failed',
        t: 5,
        parent: 1,
        extra: { error: { code: 'boom', message: 'Boom.' } },
    },
    {
        n: 6,
        agent: 'echo',
        status: 'completed',
        t: 5,
        parent: 1,
        extra: { subtreeUsage: { inputTokens: 3, outputTokens: 4 } },
    },
    {
        n: 8,
        agent: 'ghost',
        status: 'completed',
        t: 6,
    },
    {
        n: 9,
        agent: '123',
        status: 'running',
        t: 7,
    },
    {
        n: 10,
        agent: 'echo',
        status: 'cancelled',
        t: 8,
        parent: 3,
    },
    {
        n: 12,
        agent: 'echo',
        status: 'interrupted',
        t: 9,
    },
    {
        n: 11,
        agent: 'gate',
        status: 'waiting',
        t: 9,
        extra: {
            waiting: {
                kind: 'approval',
                id: '0:c1:1',
                approvalId: '0:c1:1',
                toolName: 'deploy',
                toolCallId: 'c1',
                title: 'Deploy again?',
                expiresAt,
            },
        },
    },
    {
        n: 13,
        agent: 'sweep',
        status: 'completed',
        t: 10,
    },
];

async function insertRuns(store: { runService: RunService }, runs: RunFixture[]): Promise<void> {
    for (const fixture of runs) {
        const parent = fixture.parent === undefined ? undefined : await store.runService.findOneOrFail(id(fixture.parent));

        await store.runService.create({
            id: id(fixture.n),
            agent: fixture.agent,
            status: fixture.status,
            trigger: {
                id: `t-${fixture.n}`,
                agent: fixture.agent,
                trigger: 'http',
                channel: 'http',
                payload: { n: fixture.n },
                receivedAt: at(fixture.t),
                invoker: {
                    id: 'caller',
                    kind: 'token',
                    name: 'Caller',
                    bindings: [{ permission: { name: Permission.AGENT_RUN } }],
                },
                ...(parent ?
                    {
                        parent: {
                            kind: 'dispatch' as const,
                            runId: parent.id,
                            agent: parent.agent,
                            role: 'default',
                            depth: 1,
                        },
                    } :
                    {}),
            },
            usage: { inputTokens: fixture.n, outputTokens: 1 },
            createdAt: at(fixture.t),
            updatedAt: at(fixture.t),
            ...fixture.extra,
        });
    }
}

async function setup() {
    const ctx = createTestApp({
        agents: [
            agent('echo'),
            agent('gate'),
            agent('alfred', { private: true }),
            agent('007'),
            agent('123'),
            agent('sweep', { cron: true }),
        ],
    });

    await insertRuns(ctx.store, RUNS);

    return ctx;
}

async function ambiguous() {
    const ctx = createTestApp({ agents: [agent('7'), agent('007')] });

    await insertRuns(ctx.store, [
        {
            n: 1,
            agent: '7',
            status: 'completed',
            t: 0,
        },
        {
            n: 2,
            agent: '007',
            status: 'completed',
            t: 1,
        },
    ]);

    return ctx;
}

const TOKENS: Record<string, string | undefined> = {
    admin: ADMIN_TOKEN,
    reader: READER_TOKEN,
    agentRead: tokenFor(Permission.AGENT_READ),
    echoRunner: tokenFor(restricted(Permission.AGENT_RUN, { name: 'echo' })),
    gateReader: tokenFor(restricted(Permission.AGENT_READ, { name: 'gate' })),
    alfredOwner: tokenFor(restricted(Permission.AGENT_READ, { name: 'alfred' })),
    readerAndAlfred: tokenFor(Permission.RUN_READ, restricted(Permission.AGENT_READ, { name: 'alfred' })),
    ghostNamed: tokenFor(Permission.RUN_READ, restricted(Permission.AGENT_READ, { name: 'ghost' })),
    ghostOnly: tokenFor(restricted(Permission.AGENT_READ, { name: 'ghost' })),
    cancelOnly: tokenFor(Permission.RUN_CANCEL),
    none: tokenFor(),
    anonymous: undefined,
};

/** Every query a reader sends: filters, sorts, pages, refusals. */
const READER_QUERIES = [
    '',
    'filter[agent]=echo',
    'filter%5Bagent%5D=echo',
    'filter=eq(agent,\'echo\')',
    'filter[agent]=Echo',
    'filter[agent]=ECHO',
    'filter[agent]=ghost',
    'filter[agent]=alfred',
    'filter[agent]=sweep',
    'filter[agent]=nobody',
    'filter[agent]=007',
    'filter=eq(agent,\'007\')',
    'filter[agent]=7',
    'filter[agent]=123',
    'filter[agent]="123"',
    'filter[agent]=true',
    'filter[agent]=null',
    'filter[agent]=',
    'filter[agent]=a,b',
    'filter[agent]=echo,gate',
    'filter[agent]=a&filter[agent]=b',
    'filter[agent]=~a',
    'filter[agent]=!echo',
    'filter=and(eq(agent,\'a\'),eq(agent,\'b\'))',
    'filter=or(eq(agent,\'echo\'),eq(agent,\'gate\'))',
    'filter=and(eq(agent,\'echo\'),eq(status,\'completed\'))',
    'filter[status]=completed',
    'filter[status]=queued,running',
    'filter[status]=waiting&filter[status]=completed',
    'filter[status]=interrupted,cancelled,failed',
    'filter[status]=nope',
    'filter[status]=!queued',
    'filter[status]=',
    'filter[status]=Completed',
    'filter[status]=completed&filter[agent]=echo',
    `filter[parent]=${id(1)}`,
    `filter[parent]=${id(3)}`,
    `filter[parent]=${id(2)}`,
    `filter[parent]=${id(1).toUpperCase()}`,
    `filter[parent]=${id(1)}&filter[agent]=echo`,
    `filter[parent]=${id(1)}&filter[agent]=gate`,
    `filter[parent]=${id(1)}&filter[status]=failed`,
    `filter[parent]=${id(1)}&sort=-createdAt`,
    'filter[parent]=run-1',
    'filter[parent]=123',
    'filter[parent]=',
    'filter[parent]=a,b',
    'filter[parent]=a&filter[parent]=b',
    'filter[parent]=~a',
    'filter[waiting]=approval',
    'filter[waiting]=dispatch',
    'filter[waiting]=Approval',
    'filter[waiting]=human',
    'filter[waiting]=',
    'filter[waiting]=approval,dispatch',
    'filter[waiting]=!approval',
    'filter[status]=waiting&filter[waiting]=approval&page[limit]=1',
    'filter[status]=waiting&filter[waiting]=approval&page[limit]=1&page[offset]=1',
    'filter[waiting]=approval&sort=-createdAt',
    'filter[waiting]=approval&filter[agent]=gate',
    'filter[waiting]=dispatch&filter[agent]=gate',
    'page[limit]=1',
    'page[limit]=1&page[offset]=1',
    'page[limit]=3&page[offset]=4',
    'page[limit]=2&page[offset]=5',
    'page[offset]=100',
    'page[limit]=0',
    'page[limit]=100',
    'page[limit]=101',
    'page[limit]=500',
    'page[limit]=abc',
    'page[limit]=1e2',
    'page[limit]=50.5',
    'page[limit]=-1',
    'page[offset]=1e1',
    'page[offset]=2.5',
    'page[offset]=-1',
    'page[limit]= 2',
    'sort=createdAt',
    'sort=-createdAt',
    'sort=-createdAt&page[limit]=1&page[offset]=1',
    'sort=-createdAt&page[limit]=3&page[offset]=4',
    'sort=-createdAt&filter[agent]=gate',
    'sort=createdAt,-createdAt',
    'sort=id',
    'sort=-id',
    'sort=agent',
    'sort=createdAt,id',
    'sort=',
    'filter[nope]=1',
    'filter[id]=x',
    'filter[createdAt]=1',
    'filter[agent]=a%00b',
    'fields=id',
    'include=steps',
];

/** The queries the permission matrix sends with every token. */
const SCOPED_QUERIES = [
    '',
    'filter[agent]=echo',
    'filter[agent]=gate',
    'filter[agent]=alfred',
    'filter[agent]=ghost',
    `filter[parent]=${id(1)}`,
    `filter[parent]=${id(1)}&filter[agent]=gate`,
    'filter[waiting]=approval',
    'filter[status]=completed&sort=-createdAt&page[limit]=2&page[offset]=1',
];

type Answer = { status: number; body: string };

async function answer(app: ReturnType<typeof createTestApp>['app'], query: string, token: string | undefined): Promise<Answer> {
    const response = await call(app, 'GET', query ? `/runs?${query}` : '/runs', token === undefined ? {} : { token });

    return { status: response.status, body: await response.text() };
}

describe('GET /runs answers', () => {
    it('answers byte for byte as before for every filter and sort of today\'s spec', async () => {
        const { app } = await setup();
        const answers: Record<string, Answer> = {};

        for (const query of READER_QUERIES) {
            answers[`reader ${query}`] = await answer(app, query, READER_TOKEN);
        }

        for (const query of SCOPED_QUERIES) {
            for (const [name, token] of Object.entries(TOKENS)) {
                answers[`${name} ${query}`] = await answer(app, query, token);
            }
        }

        const { app: twins } = await ambiguous();

        for (const query of ['', 'filter[agent]=7', 'filter[agent]=007', 'filter=eq(agent,\'7\')', 'filter[agent]="7"']) {
            answers[`twins ${query}`] = await answer(twins, query, READER_TOKEN);
        }

        expect(answers).toMatchSnapshot();
    });

    it('answers MCP list_runs as before', async () => {
        const { app } = await setup();
        const answers: Record<string, unknown> = {};
        const calls: Record<string, unknown>[] = [
            {},
            { agent: 'echo' },
            { agent: 'gate' },
            { agent: 'alfred' },
            { agent: 'ghost' },
            { agent: 'Echo' },
            { status: ['completed'] },
            { status: ['waiting', 'queued'] },
            { status: [] },
            { agent: 'echo', status: ['completed', 'cancelled'] },
            { limit: 2, offset: 1 },
            { limit: 100, offset: 50 },
        ];

        for (const name of ['admin', 'reader', 'echoRunner', 'gateReader', 'cancelOnly']) {
            const client = await connectMcp(app, TOKENS[name]);

            for (const args of calls) {
                const result = await callTool(client, 'list_runs', args);

                answers[`${name} ${JSON.stringify(args)}`] = {
                    isError: result.isError ?? false,
                    content: result.content,
                    structuredContent: result.structuredContent,
                };
            }

            await client.close();
        }

        expect(answers).toMatchSnapshot();
    });
});
