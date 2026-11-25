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
