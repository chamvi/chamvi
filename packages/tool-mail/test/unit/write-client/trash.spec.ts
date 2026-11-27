/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { ChamviError } from '@chamvi/errors';
import { ValidationError } from '@chamvi/errors';
import { MAIL_REQUEST_ERROR_CODE, encodeMailId } from '@chamvi/tool-mail';
import type { FakeFolder } from '../../utils/imap.ts';
import { genericFolders, untagged } from '../../utils/mail.ts';
import { setupWrite } from '../../utils/write.ts';

function idOf(folder: string, uid: number, uidValidity = '42', account = 'work'): string {
    return encodeMailId({
        account,
        folder,
        uidValidity,
        uid,
    });
}

function folderOf(folders: FakeFolder[], path: string): FakeFolder {
    return folders.find((folder) => folder.path === path)!;
}

function uidsOf(folders: FakeFolder[], path: string): number[] {
    return (folderOf(folders, path).messages ?? []).map((message) => message.uid);
}

function namesOf(commands: string[]): string[] {
    return untagged(commands).map((command) => {
        const [first = '', second = ''] = command.split(' ');

        return first.toUpperCase() === 'UID' ? `UID ${second.toUpperCase()}` : first.toUpperCase();
    });
}

/** Commands of a connection that listed folders and opened none. */
const SETUP = new Set(['CAPABILITY', 'ID', 'LOGIN', 'NAMESPACE', 'ENABLE', 'COMPRESS', 'LIST', 'LSUB']);

async function rejection(promise: Promise<unknown>): Promise<ChamviError> {
    try {
        await promise;
    } catch (error) {
        return error as ChamviError;
    }

    throw new Error('expected a rejection');
}

describe('the write client: describing mails to delete', () => {
    it('lists from, subject, folder and date in input order, and the gone and stale ids as missing', async () => {
        const { client, imap } = await setupWrite(false);
        const gone = idOf('INBOX', 99);
        const stale = idOf('INBOX', 2, '41');

        expect(await client.describe([idOf('Archive', 7), gone, idOf('INBOX', 1), stale, idOf('Archive', 7)])).toEqual({
            account: 'work',
            trash: 'Trash',
            mails: [
                {
                    id: idOf('Archive', 7),
                    folder: 'Archive',
                    from: 'Alice <alice@x.test>',
                    subject: 'Re: Hello',
                    date: '2026-11-02T08:00:00.000Z',
                },
                {
                    id: idOf('INBOX', 1),
                    folder: 'INBOX',
                    from: 'Alice <alice@x.test>',
                    subject: 'Hello',
                    date: '2026-11-01T08:00:00.000Z',
                },
            ],
            missing: [gone, stale],
        });

        const names = namesOf(imap.commands);

        expect(names).toContain('EXAMINE');
        expect(names).not.toContain('SELECT');
        expect(names).not.toContain('UID MOVE');
    });

    it('names Gmail\'s trash by its \\Trash flag', async () => {
        const { client } = await setupWrite(true);
        const listing = await client.describe([idOf('[Gmail]/All Mail', 9)]);

        expect(listing.trash).toBe('[Gmail]/Trash');
        expect(listing.mails.map((mail) => mail.subject)).toEqual(['Re: Thread start']);
    });
});

describe('the write client: moving mails to the trash', () => {
    it('moves INBOX and Archive mails to Trash once, and reports them missing on a second call', async () => {
        const {
            client,
            folders,
            imap,
        } = await setupWrite(false);
        const ids = [idOf('INBOX', 1), idOf('Archive', 7), idOf('INBOX', 1)];

        expect(await client.trash(ids)).toEqual({
            account: 'work',
            trash: 'Trash',
            moved: [idOf('INBOX', 1), idOf('Archive', 7)],
            missing: [],
        });
        expect(uidsOf(folders, 'INBOX')).toEqual([2]);
        expect(uidsOf(folders, 'Archive')).toEqual([]);
        expect(folderOf(folders, 'Trash').messages!.map((message) => message.messageId))
            .toEqual([undefined, '<root@x.test>', '<reply@y.test>']);

        const sent = imap.commands.length;

        expect(await client.trash(ids)).toEqual({
            account: 'work',
            trash: 'Trash',
            moved: [],
            missing: [idOf('INBOX', 1), idOf('Archive', 7)],
        });
        expect(namesOf(imap.commands.slice(sent))).not.toContain('SELECT');
        expect(namesOf(imap.commands.slice(sent))).not.toContain('UID MOVE');
    });

    it('moves Gmail mails to [Gmail]/Trash', async () => {
        const { client, folders } = await setupWrite(true);

        expect(await client.trash([idOf('INBOX', 1), idOf('[Gmail]/All Mail', 9)])).toEqual({
            account: 'work',
            trash: '[Gmail]/Trash',
            moved: [idOf('INBOX', 1), idOf('[Gmail]/All Mail', 9)],
            missing: [],
        });
        expect(uidsOf(folders, 'INBOX')).toEqual([]);
        expect(uidsOf(folders, '[Gmail]/All Mail')).toEqual([7, 11]);
        expect(uidsOf(folders, '[Gmail]/Trash')).toEqual([1, 2]);
    });

    it('puts the ids of a folder with a changed UIDVALIDITY in missing and moves the rest', async () => {
        const { client, folders } = await setupWrite(false);

        expect(await client.trash([idOf('INBOX', 1, '41'), idOf('Archive', 7)])).toMatchObject({
            moved: [idOf('Archive', 7)],
            missing: [idOf('INBOX', 1, '41')],
        });
        expect(uidsOf(folders, 'INBOX')).toEqual([1, 2]);
    });

    it.each([
        ['describe', (client: Awaited<ReturnType<typeof setupWrite>>['client']) => client.describe([idOf('INBOX', 1)])],
        ['trash', (client: Awaited<ReturnType<typeof setupWrite>>['client']) => client.trash([idOf('INBOX', 1)])],
    ])('refuses to %s on a server without MOVE before any SELECT', async (_, call) => {
        const {
            client,
            folders,
            imap,
        } = await setupWrite(false, { fake: { noMove: true } });
        const error = await rejection(call(client));

        expect(error.code).toBe(MAIL_REQUEST_ERROR_CODE);
        expect(error.message).toBe('mail_delete: work: move not supported');
        expect(namesOf(imap.commands).filter((name) => !SETUP.has(name))).toEqual([]);
        expect(uidsOf(folders, 'INBOX')).toEqual([1, 2]);
    });

    it.each([
        ['enabled next to IMAP4rev1', 'enabled'],
        ['the only version', 'only'],
    ] as const)('moves without the MOVE capability in an active IMAP4rev2 session (%s)', async (_, rev2) => {
        const {
            client,
            folders,
            imap,
        } = await setupWrite(false, { fake: { noMove: true, rev2 } });
        const result = await client.trash([idOf('INBOX', 1)]);

        expect(result).toMatchObject({ moved: [idOf('INBOX', 1)], missing: [] });
        expect(uidsOf(folders, 'INBOX')).toEqual([2]);
        expect(namesOf(imap.commands)).toContain('UID MOVE');
        expect(namesOf(imap.commands).some((name) => ['COPY', 'UID COPY', 'STORE', 'UID STORE', 'EXPUNGE', 'UID EXPUNGE'].includes(name))).toBe(false);
    });

    it('refuses an IMAP4rev2 the server advertises but never enabled, without MOVE', async () => {
        const {
            client,
            folders,
            imap,
        } = await setupWrite(false, { fake: { noMove: true, rev2: 'advertised' } });
        const error = await rejection(client.trash([idOf('INBOX', 1)]));

        expect(error.message).toBe('mail_delete: work: move not supported');
        expect(namesOf(imap.commands)).not.toContain('SELECT');
        expect(uidsOf(folders, 'INBOX')).toEqual([1, 2]);
    });

    it('refuses without a \\Trash flag, even with a folder named Trash', async () => {
        const folders = genericFolders();

        delete folderOf(folders, 'Trash').flags;

        const { client, imap } = await setupWrite(false, { fake: { folders } });
        const error = await rejection(client.trash([idOf('INBOX', 1)]));

        expect(error.code).toBe(MAIL_REQUEST_ERROR_CODE);
        expect(error.message).toBe('mail_delete: work: no trash folder');
        expect(namesOf(imap.commands).filter((name) => !SETUP.has(name))).toEqual([]);
        expect(uidsOf(folders, 'INBOX')).toEqual([1, 2]);
    });

    it('keeps the folders moved before a failed MOVE in Trash, and a retry reports them missing and moves the rest', async () => {
        const {
            client,
            folders,
            imap,
        } = await setupWrite(false, { fake: { moveFails: 'Archive' } });
        const ids = [idOf('INBOX', 1), idOf('Archive', 7)];
        const error = await rejection(client.trash(ids));

        expect(error.code).toBe(MAIL_REQUEST_ERROR_CODE);
        expect(error.message).toBe('mail_delete: work: request failed');
        expect(uidsOf(folders, 'INBOX')).toEqual([2]);
        expect(uidsOf(folders, 'Archive')).toEqual([7]);
        expect(uidsOf(folders, 'Trash')).toEqual([4, 5]);

        delete imap.options.moveFails;

        expect(await client.trash(ids)).toEqual({
            account: 'work',
            trash: 'Trash',
            moved: [idOf('Archive', 7)],
            missing: [idOf('INBOX', 1)],
        });
        expect(uidsOf(folders, 'Archive')).toEqual([]);
        expect(uidsOf(folders, 'Trash')).toEqual([4, 5, 6]);
    });
});

describe('the write client: delete input', () => {
    it.each([
        ['ids of two accounts', [idOf('INBOX', 1), idOf('INBOX', 2, '42', 'home')]],
        ['an id in Trash', [idOf('INBOX', 1), idOf('Trash', 4)]],
        ['an unknown account', [idOf('INBOX', 1, '42', 'home')]],
        ['an unlisted folder', [idOf('Nowhere', 1)]],
        ['no id', []],
        ['a string that is no mail id', ['work:INBOX:1']],
    ])('refuses %s before opening any folder', async (_, ids) => {
        const {
            client,
            folders,
            imap,
        } = await setupWrite(false);

        for (const call of [client.describe(ids), client.trash(ids)]) {
            expect(await rejection(call)).toBeInstanceOf(ValidationError);
        }

        expect(namesOf(imap.commands).filter((name) => !SETUP.has(name))).toEqual([]);
        expect(uidsOf(folders, 'INBOX')).toEqual([1, 2]);
    });
});
