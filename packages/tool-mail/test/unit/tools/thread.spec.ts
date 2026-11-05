/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { encodeMailId } from '@chamvi/tool-mail';
import type { MailSearchResult } from '@chamvi/tool-mail';
import type { FakeFolder } from '../../utils/imap.ts';
import { genericFolders, untagged } from '../../utils/mail.ts';
import { setup } from '../../utils/setup.ts';

/** A HEADER search: the mails whose Message-ID, In-Reply-To or References hold an id named in the command. */
function headerSearch(folders: FakeFolder[]) {
    return (path: string, command: string) => {
        const ids = command.matchAll(/"(<[^"]+>)"|(<\S+>)/g).toArray().map((match) => match[1] ?? match[2]);
        const folder = folders.find((entry) => entry.path === path);

        return (folder?.messages ?? [])
            .filter((message) => [message.messageId, message.inReplyTo, ...(message.references ?? [])]
                .some((value) => value !== undefined && ids.includes(value)))
            .map((message) => message.uid);
    };
}

describe('mail_thread', () => {
    it('finds the thread by header across the default folders and Sent', async () => {
        const folders = genericFolders();
        const { call, imap } = await setup(false, { fake: { folders, search: headerSearch(folders) } });
        const result = await call<MailSearchResult>('mail_thread', {
            id: encodeMailId({
                account: 'work',
                folder: 'INBOX',
                uidValidity: '42',
                uid: 1,
            }),
        });

        expect(result.mails.map((mail) => [mail.folder, mail.subject])).toEqual([
            ['Sent', 'Re: Re: Hello'],
            ['Archive', 'Re: Hello'],
        ]);
        expect(result.truncated).toBe(false);

        const commands = untagged(imap.commands);

        expect(commands.some((command) => command.toUpperCase().includes('BODY.PEEK[HEADER.FIELDS (MESSAGE-ID IN-REPLY-TO REFERENCES)]'))).toBe(true);
        expect(commands.filter((command) => command.startsWith('UID SEARCH')).every((command) => command.includes('HEADER'))).toBe(true);
        expect(commands).not.toContain('EXAMINE Trash');
        expect(commands).not.toContain('EXAMINE Spam');
    });

    it('searches Sent even when the configured folders leave it out', async () => {
        const folders = genericFolders();
        const { call, imap } = await setup(false, { fake: { folders, search: headerSearch(folders) }, account: { folders: ['INBOX'] } });
        const result = await call<MailSearchResult>('mail_thread', {
            id: encodeMailId({
                account: 'work',
                folder: 'INBOX',
                uidValidity: '42',
                uid: 1,
            }),
        });

        expect(result.mails.map((mail) => mail.subject)).toEqual(['Re: Re: Hello']);
        expect(untagged(imap.commands).filter((command) => command.startsWith('EXAMINE')).sort()).toEqual(['EXAMINE INBOX', 'EXAMINE Sent']);
    });

    it('follows X-GM-THRID on gmail', async () => {
        const { call, imap } = await setup(true);
        const result = await call<MailSearchResult>('mail_thread', {
            id: encodeMailId({
                account: 'work',
                folder: '[Gmail]/All Mail',
                uidValidity: '42',
                uid: 7,
            }),
        });

        expect(untagged(imap.commands)).toContain('UID SEARCH X-GM-THRID 222');
        expect(result.mails.map((mail) => mail.subject)).toEqual(['Re: Thread start']);
    });
});
