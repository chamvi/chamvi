/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { effectMarker, wrapToolsForRun } from '@chamvi/core';
import { createTestEngine, mockModel } from '@chamvi/test-kit';
import type { MockResponse } from '@chamvi/test-kit';
import {
    createMailClient,
    encodeMailId,
    mailTools,
    mailWriteTools,
} from '@chamvi/tool-mail';
import type { MailSendResult } from '@chamvi/tool-mail';
import { mailMessageIdOf, mailSendKey } from '../../../src/write-tools/keys.ts';
import { callTool, toolContext } from '../../utils/context.ts';
import { createWriteEngine } from '../../utils/engine.ts';
import type { FakeFolder } from '../../utils/imap.ts';
import { accountOf } from '../../utils/mail.ts';
import { setupWrite } from '../../utils/write.ts';

const TEXT = 'Hi Alice,\nsee you on Friday.';

const INPUT = {
    account: 'work',
    to: ['alice@x.test', 'carol@z.test'],
    cc: ['dave@w.test'],
    bcc: ['erin@v.test'],
    subject: 'Lunch on Friday',
    text: TEXT,
};

const REPLY_ID = encodeMailId({
    account: 'work',
    folder: 'Archive',
    uidValidity: '42',
    uid: 7,
});

const sendCall = (input: unknown, toolCallId = 'c1'): MockResponse => ({
    parts: [{
        type: 'tool-call',
        toolName: 'mail_send',
        input,
        toolCallId,
    }],
});

const done: MockResponse = { parts: [{ type: 'text', text: 'Done.' }] };

function folderOf(folders: FakeFolder[], path: string): FakeFolder {
    return folders.find((folder) => folder.path === path)!;
}

describe('mail_send', () => {
    it('asks the source chat with the whole mail', async () => {
        const { client } = await setupWrite(false);
        const write = createWriteEngine({ client, model: mockModel([sendCall({ ...INPUT, inReplyTo: REPLY_ID }), done]) });
        const runId = await write.dispatch();

        expect((await write.run(runId))?.status).toBe('waiting');
        expect(write.sent).toHaveLength(1);
        expect(write.sent[0]!.address).toBe('peter');
        expect(write.sent[0]!.message).toMatchObject({
            kind: 'approval',
            title: 'Send mail from work?',
            body: [
                'From: bob@y.test',
                'To: alice@x.test, carol@z.test',
                'Cc: dave@w.test',
                'Bcc: erin@v.test',
                'Subject: Lunch on Friday',
                'In reply to: Alice <alice@x.test>: Re: Hello',
                '--- mail text ---',
                TEXT,
            ].join('\n'),
        });
    });

    it('leaves out Cc, Bcc and In reply to when not given', async () => {
        const { client } = await setupWrite(false);
        const write = createWriteEngine({
            client,
            model: mockModel([sendCall({
                account: 'work',
                to: ['alice@x.test'],
                subject: 'Hi',
                text: 'Hello.',
            }), done]),
        });

        await write.dispatch();

        expect(write.sent[0]!.message.body).toBe('From: bob@y.test\nTo: alice@x.test\nSubject: Hi\n--- mail text ---\nHello.');
    });

    it('sends once after the approval, with the marker and the Message-ID of its key', async () => {
        const { client, smtp } = await setupWrite(false);
        const write = createWriteEngine({ client, model: mockModel([sendCall({ ...INPUT, inReplyTo: REPLY_ID }), done]) });
        const runId = await write.dispatch();

        expect(smtp.messages).toEqual([]);

        await write.answer(runId, true);

        const key = mailSendKey({ ...INPUT, inReplyTo: REPLY_ID }, { run: { runId } });
        const messageId = mailMessageIdOf(key, 'bob@y.test');
        const [step] = await write.steps(runId);

        expect((await write.run(runId))?.status).toBe('completed');
        expect(step?.error).toBeUndefined();
        expect(step?.output).toEqual({
            account: 'work',
            messageId,
            filed: true,
            refused: [],
        });
        expect(messageId).toMatch(/^<[0-9a-f]{32}\.chamvi@y\.test>$/);
        expect(smtp.messages).toHaveLength(1);
        expect(smtp.messages[0]!.to).toEqual(['alice@x.test', 'carol@z.test', 'dave@w.test', 'erin@v.test']);
        expect(smtp.messages[0]!.raw).toContain(`X-Chamvi-Effect: ${effectMarker(key)}\r\n`);
        expect(smtp.messages[0]!.raw).toContain(`Message-ID: ${messageId}\r\n`);
        expect(smtp.messages[0]!.raw).toContain('In-Reply-To: <reply@y.test>\r\n');
        // one approval only
        expect(write.sent).toHaveLength(1);
    });

    it('lists the refused recipients in the result', async () => {
        const { client } = await setupWrite(false, { smtp: { rejectRecipient: /carol/ } });
        const write = createWriteEngine({ client, model: mockModel([sendCall(INPUT), done]) });
        const runId = await write.dispatch();

        await write.answer(runId, true);

        const [step] = await write.steps(runId);

        expect((step?.output as MailSendResult).refused).toEqual(['carol@z.test']);
    });

    it('sends nothing when denied, naming the reason', async () => {
        const { client, smtp } = await setupWrite(false);
        const write = createWriteEngine({ client, model: mockModel([sendCall(INPUT), done]) });
        const runId = await write.dispatch();

        await write.answer(runId, false, 'später');

        const [step] = await write.steps(runId);

        expect(step?.error).toMatchObject({
            code: 'tool_denied',
            message: 'mail_send: not approved; nothing was sent. Reason: später',
        });
        expect(smtp.messages).toEqual([]);
        expect((await write.run(runId))?.status).toBe('completed');
    });

    it('asks through the inbox only when the source channel has no out', async () => {
        const { client, smtp } = await setupWrite(false);
        const write = createWriteEngine({ client, model: mockModel([sendCall(INPUT), done]) });
        const runId = await write.dispatch('http');
        const waiting = await write.waiting(runId);

        expect(waiting?.title).toBe('Send mail from work?');
        expect(waiting?.channel).toBeUndefined();
        expect(write.sent).toEqual([]);

        await write.answer(runId, true);

        expect(smtp.messages).toHaveLength(1);
        expect((await write.run(runId))?.status).toBe('completed');
    });

    it('fails the call without waiting when the approval does not fit the chat', async () => {
        const { client, smtp } = await setupWrite(false);
        const write = createWriteEngine({
            client,
            model: mockModel([sendCall({ ...INPUT, text: 'x'.repeat(500) }), done]),
            maxChars: 200,
        });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId);

        expect((await write.run(runId))?.status).toBe('completed');
        expect(step?.error).toMatchObject({
            code: 'validation_error',
            message: expect.stringMatching(/^The message has \d+ characters; this chat takes 200\. .*shorten the mail and call mail_send again; nothing was sent\.$/),
        });
        expect(write.sent).toEqual([]);
        expect(smtp.messages).toEqual([]);
    });

    it('refuses an account without smtp settings before asking', async () => {
        const { client, smtp } = await setupWrite(false, { account: { smtp: undefined } });
        const write = createWriteEngine({ client, model: mockModel([sendCall(INPUT), done]) });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId);

        expect(step?.error).toMatchObject({
            code: 'validation_error',
            message: 'mail_send: account "work" has no smtp settings and cannot send.',
        });
        expect(write.sent).toEqual([]);
        expect(smtp.messages).toEqual([]);
    });

    it.each([
        ['a subject with a header break', { subject: 'Hi\r\nBcc: x@evil.test' }, 'subject must be one line'],
        ['an address with a display name', { to: ['Eve <e@x.test>'] }, 'to[0] must be one bare address'],
        ['two addresses in one', { to: ['a@x.test, b@y.test'] }, 'to[0] must be one bare address'],
        ['a bcc address with a header break', { bcc: ['x@evil.test\r\nSubject: y'] }, 'bcc[0] must be one bare address'],
        ['51 recipients', { to: Array.from({ length: 51 }, (_, index) => `r${index}@x.test`) }, 'at most 50 recipients'],
        ['no recipient', { to: [] }, 'to must be a non-empty array'],
        ['an empty text', { text: '' }, 'text must be a string of 1 to 100000'],
        ['a subject of 501 characters', { subject: 's'.repeat(501) }, 'subject must be one line of 1 to 500'],
        ['an unknown account', { account: 'home' }, 'mail_send: account "home" is unknown'],
        ['a zero-width space in an address', { to: ['ali\u200Bce@x.test'] }, 'to[0] must be one bare address'],
        ['a bidi override in an address', { cc: ['\u202Eevil@x.test'] }, 'cc[0] must be one bare address'],
        ['a Cyrillic letter in an address', { to: ['\u0430lice@x.test'] }, 'to[0] must be one bare address'],
        ['a zero-width space in the subject', { subject: 'Lunch\u200B on Friday' }, 'subject must be one line'],
        ['a bidi override in the subject', { subject: 'Invoice \u202Efdp.exe' }, 'subject must be one line'],
        ['a bidi isolate in the subject', { subject: 'Hi \u2066there\u2069' }, 'subject must be one line'],
    ])('refuses %s before asking', async (_, change, message) => {
        const {
            client,
            smtp,
            imap,
        } = await setupWrite(false);
        const write = createWriteEngine({ client, model: mockModel([sendCall({ ...INPUT, ...change }), done]) });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId);

        expect(step?.error).toMatchObject({ code: 'validation_error', message: expect.stringContaining(message) });
        expect(write.sent).toEqual([]);
        expect(await write.waiting(runId)).toBeUndefined();
        expect(smtp.messages).toEqual([]);
        expect(imap.commands.some((command) => / UID SEARCH /.test(command))).toBe(false);
    });

    it('still asks the source chat in a run a mail read tainted, with the whole mail', async () => {
        const {
            client,
            smtp,
            imap,
        } = await setupWrite(false);
        const reader = createMailClient([accountOf(imap.port, 'work', { address: 'bob@y.test' })]);
        const write = createWriteEngine({
            client,
            model: mockModel([
                {
                    parts: [{
                        type: 'tool-call',
                        toolName: 'mail_search',
                        input: { account: 'work', query: 'hello' },
                        toolCallId: 's1',
                    }],
                },
                sendCall(INPUT, 'c2'),
                done,
            ]),
            tools: mailTools({ client: reader }),
        });

        try {
            const runId = await write.dispatch();

            expect((await write.run(runId))?.taint).toBeDefined();
            expect(write.sent).toHaveLength(1);
            expect(write.sent[0]!.message.title).toBe('Send mail from work?');
            expect(write.sent[0]!.message.body).toContain(TEXT);
            expect(write.sent[0]!.message.generic).toBeUndefined();

            await write.answer(runId, true);

            expect(smtp.messages).toHaveLength(1);
        } finally {
            await reader.close();
        }
    });

    it.each([
        ['a generic account', false],
        ['Gmail', true],
    ])('on %s, a replay without the effect record finds the sent mail: no second approval or send', async (_, gmail) => {
        const {
            client,
            smtp,
            folders,
        } = await setupWrite(gmail);
        const write = createWriteEngine({ client, model: mockModel([sendCall(INPUT), done]) });
        const runId = await write.dispatch();

        await write.answer(runId, true);
        expect(smtp.messages).toHaveLength(1);

        const key = mailSendKey(INPUT, { run: { runId } });
        const messageId = mailMessageIdOf(key, 'bob@y.test');

        if (gmail) {
            // Gmail files what it sends itself
            folderOf(folders, '[Gmail]/Sent Mail').messages = [{ uid: 3, messageId }];
        }

        // the effect record never landed: a fresh effect store
        const { effectService } = createTestEngine({ agents: [] });
        // mail_send alone: mail_delete's limit needs the engine's limit service
        const tools = wrapToolsForRun({ mail_send: mailWriteTools({ client }).mail_send! }, toolContext(runId), effectService);
        const result = await callTool(tools, 'mail_send', INPUT, toolContext(runId));

        expect(result).toEqual({
            account: 'work',
            messageId,
            filed: true,
            refused: [],
        });
        expect(smtp.messages).toHaveLength(1);
        expect(write.sent).toHaveLength(1);
    });

    it('asks through the inbox only when the source address is no direct one', async () => {
        const { client, smtp } = await setupWrite(false);
        const write = createWriteEngine({
            client,
            model: mockModel([sendCall(INPUT), done]),
            direct: false,
        });
        const runId = await write.dispatch();
        const waiting = await write.waiting(runId);

        expect(waiting?.title).toBe('Send mail from work?');
        expect(waiting?.channel).toBeUndefined();
        expect(write.sent).toEqual([]);

        await write.answer(runId, true);

        expect(smtp.messages).toHaveLength(1);
        expect((await write.run(runId))?.status).toBe('completed');
    });
});
