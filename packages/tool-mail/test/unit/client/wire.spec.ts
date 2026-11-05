/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { encodeMailId } from '@chamvi/tool-mail';
import type { MailAttachmentText, MailSearchResult } from '@chamvi/tool-mail';
import { createFakeImap } from '../../utils/imap.ts';
import type { FakeFolder } from '../../utils/imap.ts';
import { genericFolders, gmailFolders } from '../../utils/mail.ts';
import { setup } from '../../utils/setup.ts';

/** Every command a read-only client may send; anything else fails the proof. */
const ALLOWED = new Set([
    'CAPABILITY',
    'ID',
    'LOGIN',
    'AUTHENTICATE',
    'LIST',
    'LSUB',
    'NAMESPACE',
    'ENABLE',
    'COMPRESS',
    'EXAMINE',
    'STATUS',
    'SEARCH',
    'UID SEARCH',
    'FETCH',
    'UID FETCH',
    'NOOP',
    'UNSELECT',
    'CLOSE',
    'LOGOUT',
]);

/** Fetch items that set \Seen: RFC822 (not .SIZE or .HEADER), RFC822.TEXT, BODY[...] and BINARY[...]. */
const SEEN_ITEMS = /(^|[\s(])(BODY\[|BINARY\[|RFC822(\.TEXT)?(?=[\s)]|$))/i;

function nameOf(command: string): string {
    const [, first = '', second = ''] = command.split(' ');

    return first.toUpperCase() === 'UID' ? `UID ${second.toUpperCase()}` : first.toUpperCase();
}

function assertReadOnly(commands: string[]) {
    expect(commands.map(nameOf).filter((name) => !ALLOWED.has(name))).toEqual([]);

    const fetches = commands.filter((command) => nameOf(command).endsWith('FETCH'));

    expect(fetches.length).toBeGreaterThan(0);

    for (const fetch of fetches) {
        expect(fetch).not.toMatch(SEEN_ITEMS);
    }

    commands.forEach((command, index) => {
        if (nameOf(command) === 'CLOSE') {
            expect(commands.slice(0, index).some((earlier) => nameOf(earlier) === 'EXAMINE')).toBe(true);
        }
    });
}

function seenFlags(folders: FakeFolder[]): Record<string, boolean> {
    return Object.fromEntries(folders.flatMap((folder) => (folder.messages ?? [])
        .map((message) => [`${folder.path}:${message.uid}`, !!message.seen])));
}

/** Gmail folders whose All Mail uid 7 carries an attachment, so mail_attachment reaches the wire. */
function gmailWithAttachment(): FakeFolder[] {
    const folders = gmailFolders();
    const message = folders.find((folder) => folder.path === '[Gmail]/All Mail')!.messages!.find((entry) => entry.uid === 7)!;

    message.attachments = [{
        filename: 'notes.txt', 
        mediaType: 'text/plain', 
        content: 'gmail notes', 
    }];

    return folders;
}

/** Sends `lines` as tagged commands and resolves once the last one is answered. */
async function talk(port: number, lines: string[]): Promise<void> {
    const socket = net.connect(port, '127.0.0.1');
    const last = new RegExp(`^t${lines.length} `, 'm');

    await new Promise<void>((resolve, reject) => {
        let received = '';

        socket.on('error', reject);
        socket.on('data', (data) => {
            received += data.toString('utf8');

            if (last.test(received)) {
                resolve();
            }
        });
        socket.write(lines.map((line, index) => `t${index + 1} ${line}\r\n`).join(''));
    });

    socket.destroy();
}

describe('read-only on the wire', () => {
    it.each([
        ['a generic server', false, 'INBOX', 2],
        ['gmail', true, '[Gmail]/All Mail', 7],
    ])('sends only read commands to %s and changes no flag', async (_, gmail, folder, uid) => {
        const folders = gmail ? gmailWithAttachment() : genericFolders();
        const before = seenFlags(folders);
        const { call, imap } = await setup(gmail, { fake: { folders } });
        const id = encodeMailId({
            account: 'work',
            folder,
            uidValidity: '42',
            uid,
        });

        await call('mail_accounts');
        await call<MailSearchResult>('mail_search', { account: 'work', query: 'hello' });
        await call<MailSearchResult>('mail_search', { account: 'work', folder });
        await call('mail_get', { id });

        const attachment = await call<MailAttachmentText>('mail_attachment', { id, index: 0 });

        await call('mail_thread', { id });

        expect(attachment.text).toBe(gmail ? 'gmail notes' : 'the attached notes');
        expect(imap.commands.some((command) => /^\S+ UID FETCH \S+ \(.*BODY\.PEEK\[\d+\]/.test(command))).toBe(true);
        assertReadOnly(imap.commands);
        expect(imap.commands.some((command) => nameOf(command) === 'EXAMINE')).toBe(true);
        expect(Object.values(before)).toContain(false);
        expect(seenFlags(folders)).toEqual(before);
    });

    it('rejects every other command and every fetch that sets \\Seen', () => {
        const peek = 'a0 UID FETCH 1 (UID RFC822.SIZE RFC822.HEADER BODY.PEEK[])';

        for (const command of [
            'a1 SELECT INBOX',
            'a1 SETACL INBOX bob lr',
            'a1 XAPPLEPUSHSERVICE aps-version 2',
            'a1 GENURLAUTH "imap://x" INTERNAL',
            'a1 UID STORE 1 +FLAGS (\\Seen)',
            'a1 UID FETCH 1 (UID RFC822)',
            'a1 UID FETCH 1 (UID RFC822.TEXT)',
            'a1 UID FETCH 1 (BINARY[1])',
            'a1 UID FETCH 1 (UID BODY[])',
        ]) {
            expect(() => assertReadOnly([peek, command])).toThrow();
        }

        expect(() => assertReadOnly([peek])).not.toThrow();
    });

    it('runs against a fake that sets \\Seen on a non-peek fetch and on STORE', async () => {
        const folders: FakeFolder[] = [{
            path: 'INBOX',
            messages: [
                { uid: 1, text: 'a' },
                { uid: 2, text: 'b' },
                { uid: 3, text: 'c' },
            ],
        }];
        const imap = await createFakeImap({ folders });

        try {
            await talk(imap.port, [
                'LOGIN bob secret',
                'EXAMINE INBOX',
                'UID FETCH 1 (UID BODY.PEEK[])',
                'UID FETCH 2 (UID RFC822)',
                'UID STORE 3 +FLAGS (\\Seen)',
            ]);
        } finally {
            await imap.close();
        }

        expect(seenFlags(folders)).toEqual({
            'INBOX:1': false, 
            'INBOX:2': true, 
            'INBOX:3': true, 
        });
    });
});
