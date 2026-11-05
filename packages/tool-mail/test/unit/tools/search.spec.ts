/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@chamvi/core';
import { parseMailId } from '@chamvi/tool-mail';
import type { MailAccountView, MailSearchResult } from '@chamvi/tool-mail';
import { untagged } from '../../utils/mail.ts';
import { setup } from '../../utils/setup.ts';

function examined(commands: string[]): string[] {
    return untagged(commands).filter((command) => command.startsWith('EXAMINE'));
}

describe('mail_accounts', () => {
    it('lists the accounts with their folders and special uses', async () => {
        const { call } = await setup(false);
        const accounts = await call<MailAccountView[]>('mail_accounts');

        expect(accounts).toHaveLength(1);
        expect(accounts[0]!.account).toBe('work');
        expect(accounts[0]!.address).toBe('bob@y.test');
        expect(accounts[0]!.folders.map((folder) => folder.path).sort()).toEqual(['Archive', 'INBOX', 'Sent', 'Spam', 'Trash']);
        expect(accounts[0]!.folders.find((folder) => folder.path === 'Sent')?.specialUse).toBe('\\Sent');
    });
});

describe('mail_search (generic server)', () => {
    it('searches every default folder with TEXT, skipping trash and spam, newest first', async () => {
        const { call, imap } = await setup(false);
        const result = await call<MailSearchResult>('mail_search', { account: 'work', query: 'hello' });

        expect(untagged(imap.commands)).toContain('UID SEARCH TEXT hello');
        expect(examined(imap.commands).sort()).toEqual(['EXAMINE Archive', 'EXAMINE INBOX', 'EXAMINE Sent']);
        expect(result.truncated).toBe(false);
        expect(result.mails.map((mail) => mail.subject)).toEqual(['Re: Re: Hello', 'Invite and notes', 'Re: Hello', 'Hello']);

        const invite = result.mails[1]!;

        expect(invite).toMatchObject({
            account: 'work',
            folder: 'INBOX',
            from: 'Carol <carol@z.test>',
            to: 'bob@y.test',
            date: '2026-11-03T08:00:00.000Z',
            snippet: 'Please join',
            unread: true,
            hasAttachments: true,
        });
        expect(parseMailId(invite.id)).toEqual({
            account: 'work',
            folder: 'INBOX',
            uidValidity: '42',
            uid: 2,
        });
        expect(result.mails[3]).toMatchObject({
            snippet: 'Hello Bob, the plain text body.',
            unread: false,
            hasAttachments: false,
        });
    });

    it('cuts at limit and reports truncated', async () => {
        const { call } = await setup(false);
        const result = await call<MailSearchResult>('mail_search', { account: 'work', limit: 2 });

        expect(result.mails.map((mail) => mail.subject)).toEqual(['Re: Re: Hello', 'Invite and notes']);
        expect(result.truncated).toBe(true);
    });

    it('picks the newest matches by date, not by uid', async () => {
        const { call } = await setup(false, {
            fake: {
                folders: [{
                    path: 'INBOX',
                    messages: [
                        {
                            uid: 1,
                            date: '2026-11-05T08:00:00Z',
                            subject: 'Newest, low uid',
                            text: 'a',
                        },
                        {
                            uid: 2,
                            date: '2026-11-01T08:00:00Z',
                            subject: 'Imported, high uid',
                            text: 'b',
                        },
                        {
                            uid: 3,
                            date: '2026-10-01T08:00:00Z',
                            subject: 'Oldest, highest uid',
                            text: 'c',
                        },
                    ],
                }],
            },
        });
        const result = await call<MailSearchResult>('mail_search', { account: 'work', limit: 1 });

        expect(result.mails.map((mail) => mail.subject)).toEqual(['Newest, low uid']);
        expect(result.truncated).toBe(true);
    });

    it('maps the structured terms and searches only the given folder', async () => {
        const { call, imap } = await setup(false);

        await call('mail_search', {
            account: 'work',
            folder: 'Archive',
            from: 'carol',
            subject: 'plan',
            since: '2026-10-01',
            unread: true,
        });

        expect(examined(imap.commands)).toEqual(['EXAMINE Archive']);

        const search = untagged(imap.commands).find((command) => command.startsWith('UID SEARCH'));

        expect(search).toContain('FROM carol');
        expect(search).toContain('SUBJECT plan');
        expect(search).toContain('SINCE 01-Oct-2026');
        expect(search).toContain('UNSEEN');
    });

    it('searches the configured folders only', async () => {
        const { call, imap } = await setup(false, { account: { folders: ['INBOX'] } });

        await call('mail_search', { account: 'work' });

        expect(examined(imap.commands)).toEqual(['EXAMINE INBOX']);
    });

    it.each([
        [{ account: 'nope' }, /account/],
        [{ account: 'work', folder: 'Nope' }, /folder/],
        [{ account: 'work', since: 'yesterday' }, /since/],
        [{ account: 'work', limit: 51 }, /limit/],
        [{}, /account/],
    ])('refuses %j without opening a folder', async (input, message) => {
        const { call, imap } = await setup(false);

        await expect(call('mail_search', input)).rejects.toThrow(ValidationError);
        await expect(call('mail_search', input)).rejects.toThrow(message);
        expect(examined(imap.commands)).toEqual([]);
    });
});

describe('mail_search (gmail)', () => {
    it('passes the query as X-GM-RAW in All Mail', async () => {
        const { call, imap } = await setup(true);
        const result = await call<MailSearchResult>('mail_search', { account: 'work', query: 'from:a has:attachment' });

        expect(untagged(imap.commands)).toContain('UID SEARCH X-GM-RAW "from:a has:attachment"');
        expect(examined(imap.commands)).toEqual(['EXAMINE "[Gmail]/All Mail"']);
        expect(result.mails.map((mail) => mail.subject)).toEqual(['Other', 'Re: Thread start', 'Thread start']);
        expect(result.mails[0]!.folder).toBe('[Gmail]/All Mail');
    });
});
