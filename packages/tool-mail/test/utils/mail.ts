/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MailAccount } from '@chamvi/tool-mail';
import type { FakeFolder, FakeImapOptions } from './imap.ts';

export const PASSWORD = 'hunter2-very-secret';

const INVITE = [
    'BEGIN:VCALENDAR',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'SUMMARY:Planning',
    'DTSTART:20261110T090000Z',
    'ORGANIZER:mailto:carol@z.test',
    'ATTENDEE:mailto:bob@y.test',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
].join('\r\n');

/** A dovecot-like account: INBOX, Archive, Sent, Trash and Spam. */
export function genericFolders(): FakeFolder[] {
    return [
        {
            path: 'INBOX',
            messages: [
                {
                    uid: 1,
                    date: '2026-11-01T08:00:00Z',
                    subject: 'Hello',
                    text: 'Hello Bob, the plain text body.',
                    seen: true,
                    messageId: '<root@x.test>',
                },
                {
                    uid: 2,
                    date: '2026-11-03T08:00:00Z',
                    subject: 'Invite and notes',
                    from: 'Carol <carol@z.test>',
                    html: '<p>Please <b>join</b></p><script>evil()</script>',
                    messageId: '<invite@z.test>',
                    attachments: [
                        {
                            filename: 'notes.txt',
                            mediaType: 'text/plain',
                            content: 'the attached notes',
                        },
                        {
                            filename: 'invite.ics',
                            mediaType: 'text/calendar',
                            content: INVITE,
                        },
                    ],
                },
            ],
        },
        {
            path: 'Archive',
            messages: [
                {
                    uid: 7,
                    date: '2026-11-02T08:00:00Z',
                    subject: 'Re: Hello',
                    text: 'An archived reply.',
                    messageId: '<reply@y.test>',
                    inReplyTo: '<root@x.test>',
                    references: ['<root@x.test>'],
                },
            ],
        },
        {
            path: 'Sent',
            flags: ['\\Sent'],
            messages: [
                {
                    uid: 3,
                    date: '2026-11-04T08:00:00Z',
                    subject: 'Re: Re: Hello',
                    text: 'My sent answer.',
                    messageId: '<sent@x.test>',
                    inReplyTo: '<reply@y.test>',
                    references: ['<root@x.test>', '<reply@y.test>'],
                    seen: true,
                },
            ],
        },
        {
            path: 'Trash',
            flags: ['\\Trash'],
            messages: [{ uid: 4, text: 'deleted' }],
        },
        { path: 'Spam', messages: [{ uid: 5, text: 'spam' }] },
    ];
}

/** A Gmail-like account: All Mail holds every mail, threads by X-GM-THRID. */
export function gmailFolders(): FakeFolder[] {
    return [
        {
            path: 'INBOX',
            messages: [{
                uid: 1,
                text: 'inbox copy',
                threadId: '222',
            }],
        },
        { path: '[Gmail]', flags: ['\\Noselect'] },
        {
            path: '[Gmail]/All Mail',
            flags: ['\\All'],
            messages: [
                {
                    uid: 7,
                    date: '2026-11-01T08:00:00Z',
                    subject: 'Thread start',
                    text: 'first',
                    threadId: '222',
                },
                {
                    uid: 9,
                    date: '2026-11-02T08:00:00Z',
                    subject: 'Re: Thread start',
                    text: 'second',
                    threadId: '222',
                },
                {
                    uid: 11,
                    date: '2026-11-03T08:00:00Z',
                    subject: 'Other',
                    text: 'other',
                    threadId: '333',
                },
            ],
        },
        { path: '[Gmail]/Sent Mail', flags: ['\\Sent'] },
        { path: '[Gmail]/Trash', flags: ['\\Trash'] },
    ];
}

export function fakeOptions(gmail: boolean, extra: Partial<FakeImapOptions> = {}): FakeImapOptions {
    return {
        gmail,
        folders: gmail ? gmailFolders() : genericFolders(),
        ...extra,
    };
}

/** The account of a fake server on `port`. */
export function accountOf(port: number, id = 'work', extra: Partial<MailAccount> = {}): MailAccount {
    return {
        id,
        host: '127.0.0.1',
        port,
        security: 'plain',
        user: 'bob@y.test',
        password: PASSWORD,
        ...extra,
    };
}

/** The wire commands, without the tag. */
export function untagged(commands: string[]): string[] {
    return commands.map((command) => command.slice(command.indexOf(' ') + 1));
}
