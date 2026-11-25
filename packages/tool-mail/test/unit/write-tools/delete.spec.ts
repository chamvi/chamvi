/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { mockModel } from '@chamvi/test-kit';
import type { MockResponse } from '@chamvi/test-kit';
import { encodeMailId } from '@chamvi/tool-mail';
import type { MailDeleteResult } from '@chamvi/tool-mail';
import { deleteApprovalOf } from '../../../src/write-tools/approval.ts';
import { mailDeleteKey } from '../../../src/write-tools/keys.ts';
import { createWriteEngine } from '../../utils/engine.ts';
import type { FakeFolder } from '../../utils/imap.ts';
import { genericFolders } from '../../utils/mail.ts';
import { setupWrite } from '../../utils/write.ts';

function idOf(folder: string, uid: number, uidValidity = '42'): string {
    return encodeMailId({
        account: 'work',
        folder,
        uidValidity,
        uid,
    });
}

function uidsOf(folders: FakeFolder[], path: string): number[] {
    return (folders.find((folder) => folder.path === path)!.messages ?? []).map((message) => message.uid);
}

const deleteCall = (ids: string[], toolCallId = 'd1'): MockResponse => ({
    parts: [{
        type: 'tool-call',
        toolName: 'mail_delete',
        input: { ids },
        toolCallId,
    }],
});

const done: MockResponse = { parts: [{ type: 'text', text: 'Done.' }] };

const decision = (value: string): MockResponse => ({ parts: [{ type: 'text', text: JSON.stringify({ decision: value }) }] });

const IDS = [idOf('Archive', 7), idOf('INBOX', 1)];

const LISTING = [
    '2026-11-02 08:00 UTC | Alice <alice@x.test> | Re: Hello | Archive',
    '2026-11-01 08:00 UTC | Alice <alice@x.test> | Hello | INBOX',
].join('\n');

describe('mail_delete', () => {
    it('asks the source chat with the listing when the classifier says ask, and moves once approved', async () => {
        const { client, folders } = await setupWrite(false);
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall(IDS), done]),
            classifierModel: mockModel([decision('ask'), decision('ask')]),
        });
        const runId = await write.dispatch();

        expect((await write.run(runId))?.status).toBe('waiting');
        expect(write.sent).toHaveLength(1);
        expect(write.sent[0]!.message).toMatchObject({
            kind: 'approval',
            title: 'Delete 2 mails from work?',
            body: LISTING,
        });
        expect(uidsOf(folders, 'INBOX')).toEqual([1, 2]);

        await write.answer(runId, true);

        const [step] = await write.steps(runId, 'mail_delete');

        expect(step?.error).toBeUndefined();
        expect(step?.output).toEqual({
            account: 'work',
            trash: 'Trash',
            moved: IDS,
            missing: [],
        } satisfies MailDeleteResult);
        expect(uidsOf(folders, 'INBOX')).toEqual([2]);
        expect(uidsOf(folders, 'Archive')).toEqual([]);
        expect(uidsOf(folders, 'Trash')).toHaveLength(3);
        expect(write.sent).toHaveLength(1);
        expect((await write.run(runId))?.status).toBe('completed');
    });

    it('names one mail in the title', async () => {
        const { client } = await setupWrite(false);
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall([IDS[1]!]), done]),
            classifierModel: mockModel([decision('ask')]),
        });

        await write.dispatch();

        expect(write.sent[0]!.message.title).toBe('Delete 1 mail from work?');
    });

    it('moves nothing when denied, naming the reason', async () => {
        const { client, folders } = await setupWrite(false);
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall(IDS), done]),
            classifierModel: mockModel([decision('ask'), decision('ask')]),
        });
        const runId = await write.dispatch();

        await write.answer(runId, false, 'keep them');

        const [step] = await write.steps(runId, 'mail_delete');

        expect(step?.error).toMatchObject({
            code: 'tool_denied',
            message: 'mail_delete: not approved; nothing was moved. Reason: keep them',
        });
        expect(uidsOf(folders, 'INBOX')).toEqual([1, 2]);
        expect(uidsOf(folders, 'Archive')).toEqual([7]);
    });

    it('keeps the classification across the resume, so a denial stands when the classifier would now say routine', async () => {
        const { client, folders } = await setupWrite(false);
        const classifier = mockModel([decision('ask'), decision('routine')]);
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall(IDS), done]),
            classifierModel: classifier,
        });
        const runId = await write.dispatch();

        await write.answer(runId, false);

        const [step] = await write.steps(runId, 'mail_delete');

        expect(step?.error).toMatchObject({
            code: 'tool_denied',
            message: 'mail_delete: not approved; nothing was moved.',
        });
        expect(classifier.doGenerateCalls).toHaveLength(1);
        expect(uidsOf(folders, 'INBOX')).toEqual([1, 2]);
        expect(uidsOf(folders, 'Archive')).toEqual([7]);
    });

    it('asks through the inbox only when the source address is no direct one', async () => {
        const { client, folders } = await setupWrite(false);
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall(IDS), done]),
            classifierModel: mockModel([decision('ask')]),
            direct: false,
        });
        const runId = await write.dispatch();
        const waiting = await write.waiting(runId);

        expect(waiting?.title).toBe('Delete 2 mails from work?');
        expect(waiting?.channel).toBeUndefined();
        expect(write.sent).toEqual([]);

        await write.answer(runId, true);

        expect(uidsOf(folders, 'INBOX')).toEqual([2]);
        expect((await write.run(runId))?.status).toBe('completed');
    });

    it('moves routine mail without an approval', async () => {
        const { client, folders } = await setupWrite(false);
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall(IDS), done]),
            classifierModel: mockModel([decision('routine')]),
        });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId, 'mail_delete');

        expect(step?.output).toMatchObject({ moved: IDS, missing: [] });
        expect(write.sent).toEqual([]);
        expect(uidsOf(folders, 'INBOX')).toEqual([2]);
        expect((await write.run(runId))?.status).toBe('completed');
    });

    it('returns without classifier or approval when every mail is gone', async () => {
        const { client, imap } = await setupWrite(false);
        const classifier = mockModel([]);
        const gone = [idOf('INBOX', 99), idOf('Archive', 7, '41')];
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall(gone), done]),
            classifierModel: classifier,
        });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId, 'mail_delete');

        expect(step?.output).toEqual({
            account: 'work',
            trash: 'Trash',
            moved: [],
            missing: gone,
        });
        expect(classifier.doGenerateCalls).toHaveLength(0);
        expect(write.sent).toEqual([]);
        expect(imap.commands.some((command) => / UID MOVE /i.test(command))).toBe(false);
    });

    it('refuses 21 ids by its schema, before anything is read', async () => {
        const { client, imap } = await setupWrite(false);
        const ids = Array.from({ length: 21 }, (_, index) => idOf('INBOX', index + 1));
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall(ids), done]),
            classifierModel: mockModel([]),
        });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId, 'mail_delete');

        expect(step?.error).toBeDefined();
        expect(step?.output).toBeUndefined();
        expect(write.sent).toEqual([]);
        expect(imap.commands).toEqual([]);
    });

    it('fails the call without waiting when the approval does not fit the chat', async () => {
        const { client, folders } = await setupWrite(false);
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall(IDS), done]),
            classifierModel: mockModel([decision('ask')]),
            maxChars: 50,
        });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId, 'mail_delete');

        expect(step?.error).toMatchObject({
            code: 'validation_error',
            message: expect.stringMatching(/The approval does not fit this chat: delete fewer mails per call; nothing was moved\.$/),
        });
        expect(uidsOf(folders, 'INBOX')).toEqual([1, 2]);
        expect((await write.run(runId))?.status).toBe('completed');
    });

    it('keeps one listing line per mail for a from and subject with line breaks and 10 000 characters', async () => {
        const folders = genericFolders();
        const long = 'x'.repeat(10_000);

        folders[0]!.messages![0]!.from = `Eve\r\nBcc: x@evil.test ${long} <eve@x.test>`;
        folders[0]!.messages![0]!.subject = `Hi\r\nBcc: x@evil.test\r\n${long}`;

        const { client } = await setupWrite(false, { fake: { folders } });
        const listing = await client.describe([idOf('INBOX', 1), idOf('Archive', 7)]);
        const { body } = deleteApprovalOf(listing);
        const lines = body!.split('\n');

        expect(lines).toHaveLength(2);
        expect(body).not.toMatch(/\r/);

        const fields = lines[0]!.split(' | ');

        expect(fields).toHaveLength(4);
        expect(fields[1]!.startsWith('Eve  Bcc: x@evil.test')).toBe(true);
        expect(fields[2]!.startsWith('Hi  Bcc: x@evil.test')).toBe(true);

        for (const field of fields) {
            expect(Array.from(field).length).toBeLessThanOrEqual(200);
        }

        expect(Array.from(fields[1]!)).toHaveLength(200);
        expect(Array.from(fields[2]!)).toHaveLength(200);
    });

    it('keys the effect on the run and the distinct ids, in any order', () => {
        const ctx = { run: { runId: 'r1' } };
        const key = mailDeleteKey({ ids: [IDS[0]!, IDS[1]!] }, ctx);

        expect(mailDeleteKey({ ids: [IDS[1]!, IDS[0]!, IDS[1]!] }, ctx)).toBe(key);
        expect(key).toMatch(/^r1:mail_delete:[0-9a-f]{64}$/);
        expect(mailDeleteKey({ ids: [IDS[0]!] }, ctx)).not.toBe(key);
        expect(mailDeleteKey({ ids: [IDS[0]!, IDS[1]!] }, { run: { runId: 'r2' } })).not.toBe(key);
    });
});
