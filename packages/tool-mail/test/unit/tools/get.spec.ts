/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '@chamvi/core';
import { encodeMailId } from '@chamvi/tool-mail';
import type { MailAttachmentText, MailMessage, MailSearchResult } from '@chamvi/tool-mail';
import {
    MAIL_ADDRESSES_MAX_CHARS,
    MAIL_BODY_MAX_CHARS,
    MAIL_FETCH_MAX_BYTES,
    MAIL_INVITES_MAX,
    MAIL_INVITE_FIELD_MAX_CHARS,
    MAIL_SUBJECT_MAX_CHARS,
} from '../../../src/text/constants.ts';
import { untagged } from '../../utils/mail.ts';
import { setup } from '../../utils/setup.ts';

function idOf(folder: string, uid: number): string {
    return encodeMailId({
        account: 'work',
        folder,
        uidValidity: '42',
        uid,
    });
}

describe('mail_get', () => {
    it('returns headers, the body, the invites and the attachment metadata', async () => {
        const { call, imap } = await setup(false);
        const mail = await call<MailMessage>('mail_get', { id: idOf('INBOX', 2) });

        expect(mail).toMatchObject({
            id: idOf('INBOX', 2),
            account: 'work',
            folder: 'INBOX',
            from: 'Carol <carol@z.test>',
            to: 'bob@y.test',
            cc: '',
            subject: 'Invite and notes',
            messageId: '<invite@z.test>',
            references: 0,
            unread: true,
            body: 'Please join',
            offset: 0,
            totalChars: 11,
            truncated: false,
        });
        expect(mail.nextOffset).toBeUndefined();
        expect(mail.invites).toHaveLength(1);
        expect(mail.invites[0]).toContain('- Title: Planning');
        expect(mail.invites[0]).toContain('- Method: REQUEST');
        expect(mail.attachments).toEqual([
            {
                index: 0,
                filename: 'notes.txt',
                mediaType: 'text/plain',
                size: expect.any(Number),
            },
            {
                index: 1,
                filename: 'invite.ics',
                mediaType: 'text/calendar',
                size: expect.any(Number),
            },
        ]);
        expect(untagged(imap.commands).some((command) => command.includes('BODY.PEEK[]'))).toBe(true);
    });

    it('cuts the subject, the address lists and the invites', async () => {
        const many = Array.from({ length: 400 }, (_, index) => `user${index}@example.test`).join(', ');
        const invite = [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            `SUMMARY:${'s'.repeat(100_000)}`,
            'END:VEVENT',
            'END:VCALENDAR',
            '',
        ].join('\r\n');
        const { call } = await setup(false, {
            fake: {
                folders: [{
                    path: 'INBOX',
                    messages: [{
                        uid: 1,
                        subject: 'x'.repeat(20_000),
                        to: many,
                        cc: many,
                        text: 'body',
                        attachments: Array.from({ length: MAIL_INVITES_MAX + 5 }, (_, index) => ({
                            filename: `invite${index}.ics`,
                            mediaType: 'text/calendar',
                            content: invite,
                        })),
                    }],
                }],
            },
        });
        const mail = await call<MailMessage>('mail_get', { id: idOf('INBOX', 1) });

        expect(many.length).toBeGreaterThan(MAIL_ADDRESSES_MAX_CHARS);
        expect(mail.subject).toBe('x'.repeat(MAIL_SUBJECT_MAX_CHARS));
        expect(mail.to).toHaveLength(MAIL_ADDRESSES_MAX_CHARS);
        expect(mail.cc).toHaveLength(MAIL_ADDRESSES_MAX_CHARS);
        expect(mail.invites).toHaveLength(MAIL_INVITES_MAX);
        expect(mail.invites[0]).toBe(`- Title: ${'s'.repeat(MAIL_INVITE_FIELD_MAX_CHARS)}`);

        const search = await call<MailSearchResult>('mail_search', { account: 'work', folder: 'INBOX' });

        expect(search.mails[0]!.subject).toHaveLength(MAIL_SUBJECT_MAX_CHARS);
        expect(search.mails[0]!.to).toHaveLength(MAIL_ADDRESSES_MAX_CHARS);
    });

    it('pages a long body with nextOffset', async () => {
        const text = `${'a'.repeat(MAIL_BODY_MAX_CHARS)}${'b'.repeat(10)}`;
        const { call } = await setup(false, { fake: { folders: [{ path: 'INBOX', messages: [{ uid: 1, text }] }] } });
        const first = await call<MailMessage>('mail_get', { id: idOf('INBOX', 1) });

        expect(first.body).toBe('a'.repeat(MAIL_BODY_MAX_CHARS));
        expect(first.nextOffset).toBe(MAIL_BODY_MAX_CHARS);
        expect(first.totalChars).toBe(MAIL_BODY_MAX_CHARS + 10);

        const second = await call<MailMessage>('mail_get', { id: idOf('INBOX', 1), offset: first.nextOffset });

        expect(second.body).toBe('b'.repeat(10));
        expect(second.nextOffset).toBeUndefined();
        await expect(call('mail_get', { id: idOf('INBOX', 1), offset: MAIL_BODY_MAX_CHARS + 10 })).rejects.toThrow(ValidationError);
    });

    it('returns headers and attachments without fetching a mail above the size cap', async () => {
        const { call, imap } = await setup(false, {
            fake: {
                folders: [{
                    path: 'INBOX',
                    messages: [{
                        uid: 1,
                        subject: 'Huge',
                        text: 'body',
                        attachments: [{
                            filename: 'big.pdf',
                            mediaType: 'application/pdf',
                            content: 'x',
                        }],
                        size: MAIL_FETCH_MAX_BYTES + 1,
                    }],
                }],
            },
        });
        const mail = await call<MailMessage>('mail_get', { id: idOf('INBOX', 1) });

        expect(mail).toMatchObject({
            subject: 'Huge',
            body: '',
            truncated: true,
            invites: [],
        });
        expect(mail.attachments).toEqual([{
            index: 0,
            filename: 'big.pdf',
            mediaType: 'application/pdf',
            size: expect.any(Number),
        }]);
        expect(untagged(imap.commands).some((command) => command.includes('BODY.PEEK[]'))).toBe(false);
    });
});

describe('mail_attachment', () => {
    it('returns the extracted text of one attachment', async () => {
        const { call, imap } = await setup(false);
        const result = await call<MailAttachmentText>('mail_attachment', { id: idOf('INBOX', 2), index: 0 });

        expect(result).toEqual({
            id: idOf('INBOX', 2),
            index: 0,
            filename: 'notes.txt',
            mediaType: 'text/plain',
            text: 'the attached notes',
            offset: 0,
            totalChars: 18,
        });
        expect(untagged(imap.commands).some((command) => command.includes('BODY.PEEK[2]'))).toBe(true);
        expect(untagged(imap.commands).some((command) => command.includes('BODY.PEEK[]'))).toBe(false);
    });

    it('extracts a docx', async () => {
        const docx = zipSync({ 'word/document.xml': strToU8('<w:p><w:t>Docx words</w:t></w:p>') });
        const { call } = await setup(false, {
            fake: {
                folders: [{
                    path: 'INBOX',
                    messages: [{
                        uid: 1,
                        text: 'see attached',
                        attachments: [{
                            filename: 'a.docx',
                            mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            content: docx,
                        }],
                    }],
                }],
            },
        });
        const result = await call<MailAttachmentText>('mail_attachment', { id: idOf('INBOX', 1), index: 0 });

        expect(result.text).toBe('Docx words');
    });

    it('gives an empty text for an invite and refuses an unknown index', async () => {
        const { call } = await setup(false);
        const invite = await call<MailAttachmentText>('mail_attachment', { id: idOf('INBOX', 2), index: 1 });

        expect(invite.text).toBe('');
        await expect(call('mail_attachment', { id: idOf('INBOX', 2), index: 2 })).rejects.toThrow(ValidationError);
        await expect(call('mail_attachment', { id: idOf('INBOX', 2) })).rejects.toThrow(ValidationError);
    });
});
