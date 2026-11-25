/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { effectMarker } from '@chamvi/core';
import { encodeMailId } from '@chamvi/tool-mail';
import type { FakeFolder } from '../../utils/imap.ts';
import { genericFolders, gmailFolders } from '../../utils/mail.ts';
import { setupWrite } from '../../utils/write.ts';

/** Every command the write client may send; anything else fails the proof. */
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
    'SELECT',
    'SEARCH',
    'UID SEARCH',
    'FETCH',
    'UID FETCH',
    'UID MOVE',
    'APPEND',
    'NOOP',
    'UNSELECT',
    'LOGOUT',
]);

/** Fetch items that set \Seen: RFC822 (not .SIZE or .HEADER), RFC822.TEXT, BODY[...] and BINARY[...]. */
const SEEN_ITEMS = /(^|[\s(])(BODY\[|BINARY\[|RFC822(\.TEXT)?(?=[\s)]|$))/i;

function nameOf(command: string): string {
    const [, first = '', second = ''] = command.split(' ');

    return first.toUpperCase() === 'UID' ? `UID ${second.toUpperCase()}` : first.toUpperCase();
}

/** The allowlist, no fetch that sets \Seen, and an APPEND only to the `\Sent` path. */
function assertWriteWire(commands: string[], sent: string) {
    expect(commands.map(nameOf).filter((name) => !ALLOWED.has(name))).toEqual([]);

    for (const command of commands.filter((entry) => nameOf(entry).endsWith('FETCH'))) {
        expect(command).not.toMatch(SEEN_ITEMS);
    }

    for (const command of commands.filter((entry) => nameOf(entry) === 'APPEND')) {
        const path = /^\S+ APPEND ("[^"]*"|\S+) /.exec(command)?.[1];

        expect(path?.replace(/^"|"$/g, '')).toBe(sent);
    }
}

function seenFlags(folders: FakeFolder[]): Record<string, boolean> {
    return Object.fromEntries(folders.flatMap((folder) => (folder.messages ?? [])
        .map((message) => [`${folder.path}:${message.uid}`, !!message.seen])));
}

describe('the write client on the wire: sending', () => {
    it.each([
        ['a generic server', false, 'Archive', 7, 'Sent'],
        ['gmail', true, '[Gmail]/All Mail', 9, '[Gmail]/Sent Mail'],
    ])('sends a reply and looks it up with allowed commands only on %s, changing no flag', async (_, gmail, folder, uid, sent) => {
        const folders = gmail ? gmailFolders() : genericFolders();

        if (gmail) {
            // Gmail files what its SMTP server sent
            folders.find((entry) => entry.path === sent)!.messages = [{ uid: 3, messageId: '<wire.chamvi@y.test>' }];
        }

        const before = seenFlags(folders);
        const {
            client, 
            imap, 
            smtp, 
        } = await setupWrite(gmail, { fake: { folders } });
        const reply = await client.replyHeaders(encodeMailId({
            account: 'work',
            folder,
            uidValidity: '42',
            uid,
        }));
        const key = 'run-1:mail_send:wire';

        await client.send({
            account: 'work',
            to: ['alice@x.test'],
            bcc: ['dave@w.test'],
            subject: 'Re: wire',
            text: 'An answer.',
            reply,
            messageId: '<wire.chamvi@y.test>',
            marker: effectMarker(key),
        });

        expect(await client.findSent('work', { key, messageId: '<wire.chamvi@y.test>' })).toBeDefined();
        expect(smtp.messages).toHaveLength(1);
        assertWriteWire(imap.commands, sent);
        expect(imap.commands.some((command) => nameOf(command) === 'EXAMINE')).toBe(true);
        expect(imap.commands.some((command) => nameOf(command) === 'SELECT')).toBe(false);
        expect(imap.commands.some((command) => nameOf(command) === 'APPEND')).toBe(!gmail);
        expect(Object.values(before)).toContain(false);

        const after = seenFlags(folders);

        for (const [entry, seen] of Object.entries(before)) {
            expect(after[entry]).toBe(seen);
        }
    });
});

/** Every SELECT is followed by a UID MOVE, every UID MOVE follows a SELECT and names only the trash. */
function assertDeleteWire(commands: string[], trash: string) {
    const names = commands.map(nameOf);

    names.forEach((name, index) => {
        if (name === 'SELECT') {
            expect(names[index + 1]).toBe('UID MOVE');
        }

        if (name !== 'UID MOVE') {
            return;
        }

        expect(names[index - 1]).toBe('SELECT');

        const path = /^\S+ UID MOVE \S+ ("[^"]*"|\S+)$/.exec(commands[index]!)?.[1];

        expect(path?.replace(/^"|"$/g, '')).toBe(trash);
    });

    for (const forbidden of ['CLOSE', 'EXPUNGE', 'UID EXPUNGE', 'STORE', 'UID STORE', 'COPY', 'UID COPY', 'DELETE']) {
        expect(names).not.toContain(forbidden);
    }
}

describe('the write client on the wire: deleting', () => {
    it.each([
        ['a generic server', false, ['INBOX', 1, 'Archive', 7], 'Trash', 'Sent'],
        ['gmail', true, ['INBOX', 1, '[Gmail]/All Mail', 9], '[Gmail]/Trash', '[Gmail]/Sent Mail'],
    ] as const)('describes and trashes with allowed commands only on %s, SELECT right before the move, never CLOSE', async (
        _,
        gmail,
        [first, firstUid, second, secondUid],
        trash,
        sent,
    ) => {
        const {
            client,
            imap,
            folders,
        } = await setupWrite(gmail);
        const ids = [
            encodeMailId({
                account: 'work', 
                folder: first, 
                uidValidity: '42', 
                uid: firstUid,
            }),
            encodeMailId({
                account: 'work', 
                folder: second, 
                uidValidity: '42', 
                uid: secondUid,
            }),
        ];
        const before = seenFlags(folders);

        expect((await client.describe(ids)).mails).toHaveLength(2);
        expect((await client.trash(ids)).moved).toEqual(ids);

        const moved = imap.commands.length;

        // the connection is left on a SELECTed folder: switching away and logging out must not send CLOSE
        expect((await client.describe(ids)).missing).toEqual(ids);
        await client.close();

        assertWriteWire(imap.commands, sent);
        assertDeleteWire(imap.commands, trash);
        expect(imap.commands.slice(moved).map(nameOf)).toEqual(expect.arrayContaining(['EXAMINE', 'LOGOUT']));
        expect(imap.commands.map(nameOf).filter((name) => name === 'SELECT')).toHaveLength(2);
        expect(imap.commands.map(nameOf).filter((name) => name === 'UID MOVE')).toHaveLength(2);

        const after = seenFlags(folders);

        for (const [entry, seen] of Object.entries(after).filter(([entry]) => entry in before)) {
            expect(seen).toBe(before[entry]);
        }
    });

    it.each([false, true])('sends no SELECT, COPY, STORE or EXPUNGE to a server without MOVE (gmail: %s)', async (gmail) => {
        const { client, imap } = await setupWrite(gmail, { fake: { noMove: true } });
        const ids = [encodeMailId({
            account: 'work', 
            folder: 'INBOX', 
            uidValidity: '42', 
            uid: 1,
        })];

        await expect(client.describe(ids)).rejects.toThrow('move not supported');
        await expect(client.trash(ids)).rejects.toThrow('move not supported');
        await client.close();

        const names = imap.commands.map(nameOf);

        assertWriteWire(imap.commands, '');
        assertDeleteWire(imap.commands, '');
        expect(names).not.toContain('SELECT');
        expect(names).not.toContain('UID MOVE');
    });
});
