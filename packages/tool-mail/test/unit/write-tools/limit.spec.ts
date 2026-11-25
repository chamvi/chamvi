/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { mockModel } from '@chamvi/test-kit';
import type { MockResponse } from '@chamvi/test-kit';
import {
    MAIL_DELETE_LIMIT_BUCKET,
    MAIL_DELETE_LIMIT_MAX,
    MAIL_DELETE_LIMIT_WINDOW_MS,
    encodeMailId,
    mailDeleteLimit,
} from '@chamvi/tool-mail';
import { toolContext } from '../../utils/context.ts';
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

const deleteCall = (ids: string[], toolCallId: string): MockResponse => ({
    parts: [{
        type: 'tool-call',
        toolName: 'mail_delete',
        input: { ids },
        toolCallId,
    }],
});

const done: MockResponse = { parts: [{ type: 'text', text: 'Done.' }] };

const routine: MockResponse = { parts: [{ type: 'text', text: '{"decision":"routine"}' }] };

const THREE = [idOf('Archive', 7), idOf('INBOX', 1), idOf('INBOX', 2)];

const LISTING = [
    '2026-11-02 08:00 UTC | Alice <alice@x.test> | Re: Hello | Archive',
    '2026-11-01 08:00 UTC | Alice <alice@x.test> | Hello | INBOX',
    '2026-11-03 08:00 UTC | Carol <carol@z.test> | Invite and notes | INBOX',
].join('\n');

describe('mailDeleteLimit()', () => {
    it('has the defaults and weighs the distinct ids', async () => {
        const limit = mailDeleteLimit();
        const ctx = toolContext('r1');

        expect(limit).toMatchObject({
            max: MAIL_DELETE_LIMIT_MAX,
            windowMs: MAIL_DELETE_LIMIT_WINDOW_MS,
            bucket: MAIL_DELETE_LIMIT_BUCKET,
            onExceed: 'approve',
        });
        expect(await limit.weight!({ ids: ['a', 'b', 'a'] }, ctx)).toBe(2);
        expect(await limit.weight!({ ids: [] }, ctx)).toBe(1);
        expect(mailDeleteLimit({
            max: 5,
            windowMs: 60_000,
            bucket: 'mail',
        })).toMatchObject({
            max: 5,
            windowMs: 60_000,
            bucket: 'mail',
        });
    });

    it('lists the mails as detail, and their folder and uid when the server is down', async () => {
        const { client, imap } = await setupWrite(false);
        const limit = mailDeleteLimit({ client });
        const ctx = toolContext('r1');

        expect(await limit.detail!({ ids: THREE }, ctx)).toBe(LISTING);

        await imap.close();

        expect(await limit.detail!({ ids: [...THREE, 'not an id'] }, ctx)).toBe([
            'Archive uid 7',
            'INBOX uid 1',
            'INBOX uid 2',
            'not an id',
        ].join('\n'));
    });

    it('asks one limit approval with the listing, then moves without the classifier or a second approval', async () => {
        const { client, folders } = await setupWrite(false);
        const classifier = mockModel([]);
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall(THREE, 'd1'), done]),
            classifierModel: classifier,
            limits: { mail_delete: mailDeleteLimit({ max: 2 }) },
        });
        const runId = await write.dispatch();

        expect(write.sent).toHaveLength(1);
        expect(write.sent[0]!.message.title).toMatch(/^Limit reached for mail_delete: 0 of 2 used .*\(this call: 3\)\. Allow this call\?$/);
        expect(write.sent[0]!.message.body).toBe(LISTING);

        await write.answer(runId, true);

        const [step] = await write.steps(runId, 'mail_delete');

        expect(step?.output).toMatchObject({ moved: THREE, missing: [] });
        expect(uidsOf(folders, 'INBOX')).toEqual([]);
        expect(classifier.doGenerateCalls).toHaveLength(0);
        expect(write.sent).toHaveLength(1);
        expect((await write.run(runId))?.status).toBe('completed');
    });

    it('keeps weight and detail in an agent limits entry', async () => {
        const { client } = await setupWrite(false);
        const write = createWriteEngine({
            client,
            model: mockModel([
                deleteCall([THREE[0]!, THREE[1]!, idOf('INBOX', 97)], 'd1'),
                deleteCall([THREE[2]!, idOf('INBOX', 98), idOf('INBOX', 99)], 'd2'),
                done,
            ]),
            classifierModel: mockModel([routine]),
            limits: { mail_delete: mailDeleteLimit({ max: 5 }) },
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

    it('runs unlimited with limits: { mail_delete: false }', async () => {
        const { client, folders } = await setupWrite(false);
        const twenty = Array.from({ length: 20 }, (_, index) => idOf('INBOX', 100 + index));
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall(twenty, 'd1'), deleteCall([idOf('INBOX', 1)], 'd2'), done]),
            classifierModel: mockModel([routine]),
            limits: { mail_delete: false },
        });
        const runId = await write.dispatch();

        expect(write.sent).toEqual([]);
        expect(uidsOf(folders, 'INBOX')).toEqual([2]);
        expect((await write.run(runId))?.status).toBe('completed');
    });
});
