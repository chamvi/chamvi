/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission } from '@chamvi/access';
import { defineModelAgent } from '@chamvi/core';
import { http } from '@chamvi/http';
import {
    ADMIN_TOKEN,
    call,
    createTestApp,
    tokenFor,
} from '../../utils/app.ts';
import { inventoryAgents } from '../../utils/agents.ts';
import { textModel } from '../../utils/model.ts';

/*
 * The state key and document listings, byte for byte: every filter and
 * page of the state specs and of the http topic, against fixed entries.
 * The snapshot was recorded before the listings moved onto rapiq queries.
 */

async function setup() {
    const ctx = createTestApp({
        agents: [
            ...inventoryAgents(),
            defineModelAgent({
                name: 'loose',
                model: textModel(),
                instructions: 'Loose.',
                channels: [http.on()],
            }),
        ],
    });
    const state = ctx.store.stateService;

    for (const [key, value] of [
        ['b', 2],
        ['B', 'upper'],
        ['a', { n: 1 }],
        ['é', 'accent'],
        ['10', null],
        ['2', [1, 2]],
        ['a/b', false],
        [' ', ''],
    ] as const) {
        await state.set('intake', key, value);
    }

    await state.set('echo', 'x', true);

    const documents: [string, unknown][] = [
        ['i1', {
            title: 'a',
            status: 'open',
            priority: 2,
        }],
        ['i2', {
            title: 'b',
            status: 'closed',
            priority: 1,
        }],
        ['a', { issue: '42', tag: 'true' }],
        ['b', { issue: 42, tag: 'null' }],
        ['c', { issue: '007', tag: '"x"' }],
        ['d', { status: null, nested: { a: 1 } }],
        ['e', { status: 'OPEN', id: 'inner' }],
        ['f', 'a string document'],
        ['g', [1, 2]],
        ['B', { status: 'open', flag: true }],
    ];

    for (const [documentId, doc] of documents) {
        await state.upsertDocument('intake', 'issues', documentId, doc);
    }

    await state.upsertDocument('intake', 'other', 'o1', { status: 'open' });
    await state.upsertDocument('loose', 'kv', 'k1', { a: 1 });

    return ctx;
}

const KV_QUERIES = [
    '',
    'page[limit]=1',
    'page[limit]=1&page[offset]=1',
    'page[limit]=3&page[offset]=2',
    'page[offset]=6',
    'page[offset]=100',
    'page[limit]=0',
    'page[limit]=100',
    'page[limit]=101',
    'page[limit]=abc',
    'page[limit]=1e2',
    'page[offset]=-1',
    'page[offset]=2.5',
    'filter[key]=a',
    'filter=eq(key,\'a\')',
    'sort=key',
    'sort=-key',
    'fields=key',
];

const COLLECTION_QUERIES = [
    '',
    'filter[status]=open',
    'filter[status]=OPEN',
    'filter[Status]=open',
    'filter[status]=closed',
    'filter[status]=null',
    'filter[status]="null"',
    'filter[priority]=2',
    'filter[priority]="2"',
    'filter[issue]=42',
    'filter[issue]="42"',
    'filter[issue]="007"',
    'filter[issue]=007',
    'filter[tag]="true"',
    'filter[tag]=true',
    'filter[tag]="null"',
    'filter[tag]=""x""',
    'filter[flag]=true',
    'filter[status]=open&filter[title]=a',
    'filter[status]=open&filter[flag]=true',
    'filter[missing]=1',
    'filter[nested]=1',
    'filter=eq(status,\'open\')',
    'filter=and(eq(status,\'open\'),eq(priority,2))',
    'filter=and(eq(status,\'open\'),eq(status,\'open\'))',
    'filter=or(eq(status,\'open\'),eq(status,\'closed\'))',
    'filter[status]=open&filter[status]=closed',
    'filter[status]=open,closed',
    'filter[status]=!open',
    'filter[status]=~op',
    'filter[status]=',
    'filter[a.b]=1',
    'filter[id]=i1',
    'filter[doc]=x',
    'sort=id',
    'sort=-status',
    'page[limit]=1',
    'page[limit]=3',
    'page[limit]=0',
    'page[limit]=100',
    'page[limit]=101',
    'page[offset]=0',
    'page[limit]=1&page[offset]=1',
    'page[offset]=-1',
    'page[limit]=2&filter[status]=open',
];

type Answer = { status: number; body: string };

async function answer(app: ReturnType<typeof createTestApp>['app'], path: string, query: string, token: string): Promise<Answer> {
    const response = await call(app, 'GET', query ? `${path}?${query}` : path, { token });

    return { status: response.status, body: await response.text() };
}

describe('state list answers', () => {
    it('answers the kv and collection listings byte for byte as before', async () => {
        const { app } = await setup();
        const answers: Record<string, Answer> = {};
        const reader = tokenFor(Permission.STATE_READ);

        for (const query of KV_QUERIES) {
            answers[`kv ${query}`] = await answer(app, '/agents/intake/state/kv', query, reader);
        }

        answers['kv echo'] = await answer(app, '/agents/echo/state/kv', '', ADMIN_TOKEN);
        answers['kv loose'] = await answer(app, '/agents/loose/state/kv', '', ADMIN_TOKEN);

        for (const query of COLLECTION_QUERIES) {
            answers[`issues ${query}`] = await answer(app, '/agents/intake/state/collections/issues', query, reader);
        }

        answers['other collection'] = await answer(app, '/agents/intake/state/collections/other', '', ADMIN_TOKEN);
        answers['loose kv'] = await answer(app, '/agents/loose/state/collections/kv', '', ADMIN_TOKEN);
        answers['loose empty'] = await answer(app, '/agents/loose/state/collections/none', 'filter[a]=1', ADMIN_TOKEN);

        expect(answers).toMatchSnapshot();
    });
});
