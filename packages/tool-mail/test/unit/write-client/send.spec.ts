/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { ChamviError } from '@chamvi/errors';
import { ValidationError } from '@chamvi/errors';
import { ConnectionNotConfiguredError, InvalidAgentDefinitionError, effectMarker } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import {
    MAIL_REQUEST_ERROR_CODE,
    MAIL_TIMEOUT_MS,
    createMailWriteClient,
    encodeMailId,
} from '@chamvi/tool-mail';
import type { MailSendRequest } from '@chamvi/tool-mail';
import { createUnconfiguredMailWriteClient } from '../../../src/write-client/unconfigured.ts';
import type { FakeFolder } from '../../utils/imap.ts';
import {
    PASSWORD,
    accountOf,
    genericFolders,
    gmailFolders,
} from '../../utils/mail.ts';
import { SMTP_SERVER_TEXT } from '../../utils/smtp.ts';
import { setupWrite } from '../../utils/write.ts';

const KEY = 'run-1:mail_send:0123abcd';
const MESSAGE_ID = '<0123456789abcdef0123456789abcdef.chamvi@y.test>';

function request(extra: Partial<MailSendRequest> = {}): MailSendRequest {
    return {
        account: 'work',
        to: ['alice@x.test'],
        cc: ['carol@z.test'],
        bcc: ['dave@w.test'],
        subject: 'Lunch on Friday',
        text: 'Hi Alice,\n.a line starting with a dot\nsee you on Friday.',
        messageId: MESSAGE_ID,
        marker: effectMarker(KEY),
        ...extra,
    };
}

function folderOf(folders: FakeFolder[], path: string): FakeFolder {
    return folders.find((folder) => folder.path === path)!;
}

/** The header block of a raw message. */
function headersOf(raw: string): string {
    return raw.slice(0, raw.indexOf('\r\n\r\n') + 2);
}

function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();

        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;

            server.close(() => resolve(port));
        });
    });
}

async function rejection(promise: Promise<unknown>): Promise<ChamviError> {
    try {
        await promise;
    } catch (error) {
        return error as ChamviError;
    }

    throw new Error('expected a rejection');
}

describe('the write client: sending', () => {
    it('sends one message with the marker and the Message-ID, without a Bcc header, to every recipient', async () => {
        const { smtp, client } = await setupWrite(false);

        await client.send(request());

        expect(smtp.messages).toHaveLength(1);

        const [message] = smtp.messages;
        const headers = headersOf(message!.raw);

        expect(message!.from).toBe('bob@y.test');
        expect(message!.to).toEqual(['alice@x.test', 'carol@z.test', 'dave@w.test']);
        expect(headers).toContain(`X-Chamvi-Effect: <!-- chamvi:effect=${KEY} -->\r\n`);
        expect(headers).toContain(`Message-ID: ${MESSAGE_ID}\r\n`);
        expect(headers).toContain('To: alice@x.test\r\n');
        expect(headers).toContain('Cc: carol@z.test\r\n');
        expect(headers).toContain('Subject: Lunch on Friday\r\n');
        expect(headers).not.toMatch(/^Bcc:/im);
        expect(message!.raw).not.toContain('dave@w.test');
        expect(message!.raw).toContain('.a line starting with a dot');
        expect(smtp.commands).toContain('AUTH PLAIN');
    });

    it('files the sent bytes plus the Bcc header in Sent with \\Seen on a generic account', async () => {
        const {
            smtp,
            client,
            folders,
            imap,
        } = await setupWrite(false);

        expect(await client.send(request())).toEqual({
            account: 'work',
            messageId: MESSAGE_ID,
            filed: true,
            refused: [],
        });

        const filed = folderOf(folders, 'Sent').messages!.at(-1)!;

        expect(filed.flags).toEqual(['\\Seen']);
        expect(filed.messageId).toBe(MESSAGE_ID);
        expect(filed.raw).toMatch(/^Bcc: dave@w\.test\r\n/m);
        expect(filed.raw!.replace(/^Bcc: [^\r]*\r\n/m, '')).toBe(smtp.messages[0]!.raw);
        expect(imap.commands.filter((command) => / APPEND /.test(command))).toHaveLength(1);
        expect(imap.commands.find((command) => / APPEND /.test(command))).toMatch(/ APPEND "?Sent"? \(\\Seen\)/);
    });

    it('sets In-Reply-To and References for a reply', async () => {
        const { smtp, client } = await setupWrite(false);
        const reply = await client.replyHeaders(encodeMailId({
            account: 'work',
            folder: 'Archive',
            uidValidity: '42',
            uid: 7,
        }));

        expect(reply).toEqual({
            messageId: '<reply@y.test>',
            references: ['<root@x.test>', '<reply@y.test>'],
            from: 'Alice <alice@x.test>',
            subject: 'Re: Hello',
        });

        await client.send(request({ reply }));

        const headers = headersOf(smtp.messages[0]!.raw);

        expect(headers).toContain('In-Reply-To: <reply@y.test>\r\n');
        expect(headers).toContain('References: <root@x.test> <reply@y.test>\r\n');
    });

    it('keeps the last ten references of the answered mail', async () => {
        const folders = genericFolders();
        const references = Array.from({ length: 12 }, (_, index) => `<r${index}@x.test>`);

        folderOf(folders, 'INBOX').messages!.push({
            uid: 9,
            messageId: '<long@x.test>',
            references,
        });

        const { client } = await setupWrite(false, { fake: { folders } });
        const reply = await client.replyHeaders(encodeMailId({
            account: 'work',
            folder: 'INBOX',
            uidValidity: '42',
            uid: 9,
        }));

        expect(reply.references).toEqual([...references.slice(-10), '<long@x.test>']);
    });

    it.each([
        ['a changed UIDVALIDITY', {
            folder: 'INBOX',
            uidValidity: '41',
            uid: 1,
        }, 'mail id is stale, search again'],
        ['a missing uid', {
            folder: 'INBOX',
            uidValidity: '42',
            uid: 99,
        }, 'mail id is stale, search again'],
        ['an unlisted folder', {
            folder: 'Nowhere',
            uidValidity: '42',
            uid: 1,
        }, 'search again'],
    ])('refuses a reply to %s', async (_, parts, message) => {
        const { client } = await setupWrite(false);
        const error = await rejection(client.replyHeaders(encodeMailId({ account: 'work', ...parts })));

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toContain(message);
    });

    it('sends on Gmail without an APPEND: Gmail files the mail itself', async () => {
        const {
            smtp,
            client,
            imap,
        } = await setupWrite(true);

        expect(await client.send(request())).toEqual({
            account: 'work',
            messageId: MESSAGE_ID,
            filed: true,
            refused: [],
        });
        expect(smtp.messages).toHaveLength(1);
        expect(imap.commands.some((command) => / APPEND /.test(command))).toBe(false);
    });

    it('does not file without a \\Sent folder', async () => {
        const folders = genericFolders().map((folder) => ({ ...folder, flags: [] }));
        const {
            smtp,
            client,
            imap,
        } = await setupWrite(false, { fake: { folders } });

        expect((await client.send(request())).filed).toBe(false);
        expect(smtp.messages).toHaveLength(1);
        expect(imap.commands.some((command) => / APPEND /.test(command))).toBe(false);
    });

    it('reports the recipients the server refused and sends to the others', async () => {
        const { smtp, client } = await setupWrite(false, { smtp: { rejectRecipient: /carol/ } });

        expect(await client.send(request())).toEqual({
            account: 'work',
            messageId: MESSAGE_ID,
            filed: true,
            refused: ['carol@z.test'],
        });
        expect(smtp.messages).toHaveLength(1);
        expect(smtp.messages[0]!.to).toEqual(['alice@x.test', 'dave@w.test']);
    });

    it('files the Sent copy even when the run is aborted after the SMTP accept', async () => {
        const controller = new AbortController();
        const {
            smtp,
            client,
            folders,
        } = await setupWrite(false, {
            fake: {
                onCommand: (line) => {
                    if (/ LOGIN /.test(line)) {
                        controller.abort(new Error('drain'));
                    }
                },
            },
        });

        expect((await client.send(request(), controller.signal)).filed).toBe(true);
        expect(controller.signal.aborted).toBe(true);
        expect(smtp.messages).toHaveLength(1);
        expect(folderOf(folders, 'Sent').messages!.at(-1)!.messageId).toBe(MESSAGE_ID);
    });

    it.each([
        ['a marker', { marker: '<!-- chamvi:effect=x -->\r\nBcc: eve@x.test' }],
        ['a Message-ID', { messageId: '<a@y.test>\nBcc: eve@x.test' }],
    ])('refuses %s with a line break before any SMTP traffic', async (_, extra) => {
        const { smtp, client } = await setupWrite(false);

        await expect(client.send(request(extra))).rejects.toBeInstanceOf(ValidationError);
        expect(smtp.commands).toEqual([]);
    });

    it('answers filed: false when the APPEND is refused, and does not throw', async () => {
        const { smtp, client } = await setupWrite(false, { fake: { appendFails: true } });

        expect(await client.send(request())).toEqual({
            account: 'work',
            messageId: MESSAGE_ID,
            filed: false,
            refused: [],
        });
        expect(smtp.messages).toHaveLength(1);
    });

    it('answers filed: false when the IMAP server is gone after the SMTP accept', async () => {
        const {
            smtp,
            client,
            imap,
        } = await setupWrite(false);

        await imap.close();

        expect((await client.send(request())).filed).toBe(false);
        expect(smtp.messages).toHaveLength(1);
    });
});

describe('the write client: finding a sent mail', () => {
    it('finds a sent mail by its X-Chamvi-Effect header on a generic account', async () => {
        const { client, imap } = await setupWrite(false);

        expect(await client.findSent('work', { key: KEY, messageId: MESSAGE_ID })).toBeUndefined();

        await client.send(request());

        expect(await client.findSent('work', { key: KEY, messageId: MESSAGE_ID })).toEqual({
            account: 'work',
            messageId: MESSAGE_ID,
            filed: true,
            refused: [],
        });
        expect(await client.findSent('work', { key: 'run-1:mail_send:other', messageId: '<other.chamvi@y.test>' })).toBeUndefined();
        expect(imap.commands.some((command) => /UID SEARCH OR HEADER X-CHAMVI-EFFECT \S+ HEADER MESSAGE-ID /i.test(command))).toBe(true);
        expect(imap.commands.some((command) => / EXAMINE "?Sent"?$/.test(command))).toBe(true);
    });

    it('finds a sent mail by its Message-ID on a server that does not index custom headers', async () => {
        const folders = genericFolders();

        folderOf(folders, 'Sent').messages!.push({ uid: 8, messageId: MESSAGE_ID });

        const { client } = await setupWrite(false, { fake: { folders } });

        expect(await client.findSent('work', { key: KEY, messageId: MESSAGE_ID })).toEqual({
            account: 'work',
            messageId: MESSAGE_ID,
            filed: true,
            refused: [],
        });
    });

    it('finds a sent mail by its Message-ID on Gmail', async () => {
        const folders = gmailFolders();

        folderOf(folders, '[Gmail]/Sent Mail').messages = [{ uid: 3, messageId: MESSAGE_ID }];

        const { client, imap } = await setupWrite(true, { fake: { folders } });

        expect(await client.findSent('work', { key: KEY, messageId: MESSAGE_ID })).toEqual({
            account: 'work',
            messageId: MESSAGE_ID,
            filed: true,
            refused: [],
        });
        expect(await client.findSent('work', { key: KEY, messageId: '<other.chamvi@y.test>' })).toBeUndefined();
        expect(imap.commands.some((command) => / UID SEARCH X-GM-RAW "?rfc822msgid:</.test(command))).toBe(true);
        expect(imap.commands.some((command) => /HEADER X-CHAMVI-EFFECT/i.test(command))).toBe(false);
    });

    it('answers undefined without a search when the account cannot send or has no \\Sent', async () => {
        const plain = await setupWrite(false, { account: { smtp: undefined } });

        expect(await plain.client.findSent('work', { key: KEY, messageId: MESSAGE_ID })).toBeUndefined();
        expect(plain.imap.commands).toEqual([]);

        const folders = genericFolders().map((folder) => ({ ...folder, flags: [] }));
        const unfiled = await setupWrite(false, { fake: { folders } });

        expect(await unfiled.client.findSent('work', { key: KEY, messageId: MESSAGE_ID })).toBeUndefined();
        expect(unfiled.imap.commands.some((command) => / (UID SEARCH|EXAMINE) /.test(command))).toBe(false);
    });

    it('throws when the search fails', async () => {
        const { client, imap } = await setupWrite(false);

        await imap.close();

        const error = await rejection(client.findSent('work', { key: KEY, messageId: MESSAGE_ID }));

        expect(error.code).toBe(MAIL_REQUEST_ERROR_CODE);
        expect(error.message).toBe('mail_send: work: cannot connect');
    });
});

describe('the write client: failures', () => {
    it('reports a refused login without the password or the server text', async () => {
        const { client, imap } = await setupWrite(false, { smtp: { authFails: true } });
        const error = await rejection(client.send(request()));

        expect(error.code).toBe(MAIL_REQUEST_ERROR_CODE);
        expect(error.message).toBe('mail_send: work: login failed');
        expect(imap.commands.some((command) => / APPEND /.test(command))).toBe(false);
    });

    it('reports a closed port as cannot connect', async () => {
        const port = await freePort();
        const { client } = await setupWrite(false, {
            account: {
                smtp: {
                    host: '127.0.0.1',
                    port,
                    security: 'plain',
                },
            },
        });
        const error = await rejection(client.send(request()));

        expect(error.message).toBe('mail_send: work: cannot connect');
    });

    it('reports refused recipients without the server text', async () => {
        const { client, smtp } = await setupWrite(false, { smtp: { rejectRecipient: /./ } });
        const error = await rejection(client.send(request()));

        expect(error.message).toBe('mail_send: work: recipient refused');
        expect(error.message).not.toContain(SMTP_SERVER_TEXT);
        expect(smtp.messages).toEqual([]);
    });

    it('times out on the clock when the server does not answer', async () => {
        const clock = new ControllableClock();
        const { client, smtp } = await setupWrite(false, { clock, smtp: { hold: /^DATA/ } });
        const pending = rejection(client.send(request()));

        await expect.poll(() => smtp.commands.includes('DATA')).toBe(true);
        clock.advance(MAIL_TIMEOUT_MS);

        const error = await pending;

        expect(error.code).toBe(MAIL_REQUEST_ERROR_CODE);
        expect(error.message).toBe('mail_send: work: timed out');
    });

    it('says the mail may have been sent when the 250 after the handed-over message never comes', async () => {
        const clock = new ControllableClock();
        const { client, smtp } = await setupWrite(false, { clock, smtp: { holdMessage: true } });
        const pending = rejection(client.send(request()));

        await expect.poll(() => smtp.messages.length).toBe(1);
        clock.advance(MAIL_TIMEOUT_MS);

        const error = await pending;

        expect(error.code).toBe(MAIL_REQUEST_ERROR_CODE);
        expect(error.message).toBe('mail_send: work: timed out after the message was handed over; it may have been sent');
    });

    it('says the mail may have been sent on an abort after the message was handed over', async () => {
        const { client, smtp } = await setupWrite(false, { smtp: { holdMessage: true } });
        const controller = new AbortController();
        const pending = rejection(client.send(request(), controller.signal));

        await expect.poll(() => smtp.messages.length).toBe(1);
        controller.abort(new Error('stop'));

        expect((await pending).message).toBe('mail_send: work: timed out after the message was handed over; it may have been sent');
    });

    it('rethrows the reason of an aborted signal', async () => {
        const { client, smtp } = await setupWrite(false, { smtp: { hold: /^DATA/ } });
        const controller = new AbortController();
        const reason = new Error('stop');
        const pending = client.send(request(), controller.signal);

        await expect.poll(() => smtp.commands.includes('DATA')).toBe(true);
        controller.abort(reason);

        await expect(pending).rejects.toBe(reason);
        await expect(client.send(request(), AbortSignal.abort(reason))).rejects.toBe(reason);
    });

    it('never puts the password or the server text into an error', async () => {
        const failing = [
            await setupWrite(false, { smtp: { authFails: true } }),
            await setupWrite(false, { smtp: { rejectRecipient: /alice/ } }),
        ];

        for (const { client } of failing) {
            const error = await rejection(client.send(request({ cc: [], bcc: [] })));

            expect(error.message).not.toContain(PASSWORD);
            expect(error.message).not.toContain(SMTP_SERVER_TEXT);
            expect(JSON.stringify(error)).not.toContain(PASSWORD);
        }
    });

    it('refuses an unknown account and an account without smtp', async () => {
        const { client } = await setupWrite(false, { account: { smtp: undefined } });

        await expect(client.send(request({ account: 'home' }))).rejects.toBeInstanceOf(ValidationError);
        await expect(client.send(request())).rejects.toThrow('mail_send: account "work" has no smtp settings and cannot send.');
    });
});

describe('createMailWriteClient()', () => {
    it('shows each account', async () => {
        const { client } = await setupWrite(true);

        expect(client.account('work')).toEqual({
            id: 'work',
            address: 'bob@y.test',
            gmail: true,
            smtp: true,
        });
        expect(client.account('home')).toBeUndefined();
    });

    it('refuses bad smtp settings naming the field, never the value', () => {
        const account = { ...accountOf(1), smtp: { host: '' } };

        expect(() => createMailWriteClient([account])).toThrow(InvalidAgentDefinitionError);
        expect(() => createMailWriteClient([account])).toThrow('createMailWriteClient() accounts[0].smtp.host must be a non-empty string.');
        expect(() => createMailWriteClient([])).toThrow('createMailWriteClient() accounts must be a non-empty array.');
        expect(() => createMailWriteClient([accountOf(1)], { timeoutMs: 0 })).toThrow('createMailWriteClient() timeoutMs');
    });
});

describe('the unconfigured write client', () => {
    it('refuses every call naming the connection', async () => {
        const client = createUnconfiguredMailWriteClient('mail');

        expect(client.configured).toBe(false);
        expect(client.account('work')).toBeUndefined();
        await expect(client.send(request())).rejects.toBeInstanceOf(ConnectionNotConfiguredError);
        await expect(client.findSent('work', { key: KEY, messageId: MESSAGE_ID })).rejects.toBeInstanceOf(ConnectionNotConfiguredError);
        await expect(client.replyHeaders('work:SU5CT1g:42:1')).rejects.toBeInstanceOf(ConnectionNotConfiguredError);
        await expect(client.close()).resolves.toBeUndefined();
    });
});
