/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { ToolLimit } from '@chamvi/core';
import { mockModel } from '@chamvi/test-kit';
import type { MockResponse } from '@chamvi/test-kit';
import {
    MAIL_DELETE_LIMIT_BUCKET,
    MAIL_DELETE_LIMIT_MAX,
    MAIL_DELETE_LIMIT_WINDOW_MS,
    encodeMailId,
    mailWriteTools,
} from '@chamvi/tool-mail';
import type { IMailWriteClient, MailWriteToolsOptions } from '@chamvi/tool-mail';
import { createWriteEngine } from '../../utils/engine.ts';
import type { FakeFolder } from '../../utils/imap.ts';
import { setupWrite } from '../../utils/write.ts';

function idOf(folder: string, uid: number): string {
    return encodeMailId({
        account: 'work',
        folder,
        uidValidity: '42',
        uid,
    });
}

function uidsOf(folders: FakeFolder[], path: string): number[] {
    return (folders.find((folder) => folder.path === path)!.messages ?? []).map((message) => message.uid);
}

function limitOf(client: IMailWriteClient, deleteLimit?: MailWriteToolsOptions['deleteLimit']): ToolLimit | undefined {
    const tools = mailWriteTools({ client, ...(deleteLimit !== undefined && { deleteLimit }) });

    return (tools.mail_delete as { limit?: ToolLimit }).limit;
}

/** `client` whose first `describe` fails (a transient IMAP error), the rest as given. */
function flakyDescribe(client: IMailWriteClient): IMailWriteClient {
    let failed = false;

    return {
        account: (id) => client.account(id),
        send: (request, signal) => client.send(request, signal),
        findSent: (account, lookup, signal) => client.findSent(account, lookup, signal),
        describe: async (ids, signal) => {
            if (!failed) {
                failed = true;

                throw new Error('connection reset');
            }

            return client.describe(ids, signal);
        },
        trash: (ids, signal) => client.trash(ids, signal),
        replyHeaders: (id, signal) => client.replyHeaders(id, signal),
        close: () => client.close(),
    };
}

const deleteCall = (ids: string[], toolCallId: string): MockResponse => ({
    parts: [{
        type: 'tool-call',
        toolName: 'mail_delete',
        input: { ids },
        toolCallId,
    }],
});

const done: MockResponse = { parts: [{ type: 'text', text: 'Done.' }] };

const decision = (value: string): MockResponse => ({ parts: [{ type: 'text', text: JSON.stringify({ decision: value }) }] });

const THREE = [idOf('Archive', 7), idOf('INBOX', 1), idOf('INBOX', 2)];

const LISTING = [
    '2026-11-02 08:00 UTC | Alice <alice@x.test> | Re: Hello | Archive',
    '2026-11-01 08:00 UTC | Alice <alice@x.test> | Hello | INBOX',
    '2026-11-03 08:00 UTC | Carol <carol@z.test> | Invite and notes | INBOX',
].join('\n');

const LIMIT_TITLE = /^Limit reached for mail_delete: 0 of 2 used .*\(this call: 3\)\. Allow this call\?$/;

describe('mail_delete\'s own limit', () => {
    it('has the defaults, takes deleteLimit and weighs the distinct ids', async () => {
        const { client } = await setupWrite(false);
        const limit = limitOf(client);

        expect(limit).toMatchObject({
            max: MAIL_DELETE_LIMIT_MAX,
            windowMs: MAIL_DELETE_LIMIT_WINDOW_MS,
            bucket: MAIL_DELETE_LIMIT_BUCKET,
            onExceed: 'approve',
        });
        expect(await limit!.weight!({ ids: ['a', 'b', 'a'] }, {} as never)).toBe(2);
        expect(await limit!.weight!({ ids: [] }, {} as never)).toBe(1);
        expect(limitOf(client, {
            max: 5,
            windowMs: 60_000,
            bucket: 'mail',
        })).toMatchObject({
            max: 5,
            windowMs: 60_000,
            bucket: 'mail',
        });
        expect(limitOf(client, false)).toBeUndefined();
        expect(() => mailWriteTools({ client, deleteLimit: 5 as never })).toThrow(InvalidAgentDefinitionError);
    });

    it('asks one limit approval with the listing, then moves without the classifier or a second approval', async () => {
        const { client, folders } = await setupWrite(false);
        const classifier = mockModel([]);
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall(THREE, 'd1'), done]),
            classifierModel: classifier,
            deleteLimit: { max: 2 },
        });
        const runId = await write.dispatch();

        expect(write.sent).toHaveLength(1);
        expect(write.sent[0]!.message.title).toMatch(LIMIT_TITLE);
        expect(write.sent[0]!.message.body).toBe(LISTING);

        await write.answer(runId, true);

        const [step] = await write.steps(runId, 'mail_delete');

        expect(step?.output).toMatchObject({ moved: THREE, missing: [] });
        expect(uidsOf(folders, 'INBOX')).toEqual([]);
        expect(classifier.doGenerateCalls).toHaveLength(0);
        expect(write.sent).toHaveLength(1);
        expect((await write.run(runId))?.status).toBe('completed');
    });

    it('lists the mails through the tools\' own client of accounts, with no client provided on the engine', async () => {
        const { account, folders } = await setupWrite(false);
        const classifier = mockModel([]);
        const write = createWriteEngine({
            accounts: [account],
            model: mockModel([deleteCall(THREE, 'd1'), done]),
            classifierModel: classifier,
            deleteLimit: { max: 2 },
        });
        const runId = await write.dispatch();

        expect(write.sent[0]!.message.body).toBe(LISTING);

        await write.answer(runId, true);

        expect(uidsOf(folders, 'INBOX')).toEqual([]);
        expect(classifier.doGenerateCalls).toHaveLength(0);
    });

    it('still classifies and asks after a limit approval that could show only folders and uids', async () => {
        const { client, folders } = await setupWrite(false);
        const classifier = mockModel([decision('ask')]);
        const write = createWriteEngine({
            client: flakyDescribe(client),
            model: mockModel([deleteCall(THREE, 'd1'), done]),
            classifierModel: classifier,
            deleteLimit: { max: 2 },
        });
        const runId = await write.dispatch();

        expect(write.sent[0]!.message.title).toMatch(LIMIT_TITLE);
        expect(write.sent[0]!.message.body).toBe('Archive uid 7\nINBOX uid 1\nINBOX uid 2');

        await write.answer(runId, true);

        expect(classifier.doGenerateCalls).toHaveLength(1);
        expect(write.sent).toHaveLength(2);
        expect(write.sent[1]!.message).toMatchObject({ title: 'Delete 3 mails from work?', body: LISTING });
        expect(uidsOf(folders, 'INBOX')).toEqual([1, 2]);

        await write.answer(runId, true);

        expect(uidsOf(folders, 'INBOX')).toEqual([]);
        expect((await write.run(runId))?.status).toBe('completed');
    });

    it('still classifies and asks after an agent limits entry, which shows no listing', async () => {
        const { account, folders } = await setupWrite(false);
        const classifier = mockModel([decision('ask')]);
        const write = createWriteEngine({
            accounts: [account],
            model: mockModel([deleteCall(THREE, 'd1'), done]),
            classifierModel: classifier,
            // an entry of its own: a weight, but no detail
            limits: {
                mail_delete: {
                    max: 2,
                    windowMs: 3_600_000,
                    weight: (input: { ids: string[] }) => input.ids.length,
                },
            },
        });
        const runId = await write.dispatch();

        expect(write.sent[0]!.message.title).toMatch(LIMIT_TITLE);
        expect(write.sent[0]!.message.body ?? '').toBe('');

        await write.answer(runId, true);

        expect(classifier.doGenerateCalls).toHaveLength(1);
        expect(write.sent[1]!.message).toMatchObject({ title: 'Delete 3 mails from work?', body: LISTING });

        await write.answer(runId, false);

        expect(uidsOf(folders, 'INBOX')).toEqual([1, 2]);
    });

    it('counts weights: a second call over max asks with its listing', async () => {
        const { client } = await setupWrite(false);
        const write = createWriteEngine({
            client,
            model: mockModel([
                deleteCall([THREE[0]!, THREE[1]!, idOf('INBOX', 97)], 'd1'),
                deleteCall([THREE[2]!, idOf('INBOX', 98), idOf('INBOX', 99)], 'd2'),
                done,
            ]),
            classifierModel: mockModel([decision('routine')]),
            deleteLimit: { max: 5 },
        });
        const runId = await write.dispatch();
        const [first] = await write.steps(runId, 'mail_delete');

        expect(first?.output).toMatchObject({ moved: THREE.slice(0, 2) });
        expect(write.sent).toHaveLength(1);
        expect(write.sent[0]!.message.title).toMatch(/^Limit reached for mail_delete: 3 of 5 used .*\(this call: 3\)\. Allow this call\?$/);
        expect(write.sent[0]!.message.body).toBe('2026-11-03 08:00 UTC | Carol <carol@z.test> | Invite and notes | INBOX');
    });

    it('carries the default limit of 20 mails an hour', async () => {
        const { client } = await setupWrite(false);
        const twenty = Array.from({ length: 20 }, (_, index) => idOf('INBOX', 100 + index));
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall(twenty, 'd1'), deleteCall([idOf('INBOX', 1)], 'd2'), done]),
            classifierModel: mockModel([]),
        });
        const runId = await write.dispatch();

        expect(write.sent).toHaveLength(1);
        expect(write.sent[0]!.message.title).toMatch(/^Limit reached for mail_delete: 20 of 20 used /);
        expect((await write.run(runId))?.status).toBe('waiting');
    });

    it.each([
        ['deleteLimit: false', { deleteLimit: false as const }],
        ['limits: { mail_delete: false }', { limits: { mail_delete: false as const } }],
    ])('runs unlimited with %s', async (_, options) => {
        const { client, folders } = await setupWrite(false);
        const twenty = Array.from({ length: 20 }, (_, index) => idOf('INBOX', 100 + index));
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall(twenty, 'd1'), deleteCall([idOf('INBOX', 1)], 'd2'), done]),
            classifierModel: mockModel([decision('routine')]),
            ...options,
        });
        const runId = await write.dispatch();

        expect(write.sent).toEqual([]);
        expect(uidsOf(folders, 'INBOX')).toEqual([2]);
        expect((await write.run(runId))?.status).toBe('completed');
    });
});
