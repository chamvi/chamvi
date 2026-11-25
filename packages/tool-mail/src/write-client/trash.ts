/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import type { ImapFlow, ListResponse } from 'imapflow';
import { requestError } from '../client/asserts.ts';
import { MAIL_DATE_QUERY } from '../client/constants.ts';
import { isAllowedFolder } from '../client/folders.ts';
import { parseMailId } from '../client/ids.ts';
import { openMailFolder } from '../client/mailbox.ts';
import { addressListOf, dateOf, subjectOf } from '../client/message.ts';
import type { MailConnectionPool } from '../client/pool.ts';
import type { MailIdParts } from '../client/types.ts';
import type { MailAccountNormalized } from '../options/types.ts';
import type {
    MailDeleteItem,
    MailDeleteListing,
    MailDeleteResult,
} from './types.ts';

const TOOL = 'mail_delete';

/** A parsed id of a delete. */
type MailDeleteTarget = MailIdParts & { id: string };

/** The ids of a delete, parsed and deduplicated in input order, all of one account (ValidationError otherwise). */
export function mailDeleteTargetsOf(ids: string[]): { account: string; targets: MailDeleteTarget[] } {
    const unique = [...new Set(ids)];

    if (unique.length === 0) {
        throw new ValidationError('ids must name at least one mail.');
    }

    const targets = unique.map((id) => ({ ...parseMailId(id), id }));
    const { account } = targets[0]!;

    const mixed = targets.some((target) => target.account !== account);

    if (mixed) {
        throw new ValidationError('ids name mails of more than one account: delete the mails of each account in a separate call.');
    }

    return { account, targets };
}

/**
 * Whether imapflow sends a native `UID MOVE` on this session (as its `hasCapability(connection, 'MOVE')`,
 * imapflow 2.12.2 `tools.ts`): the MOVE capability, or an active IMAP4rev2 session, which folds MOVE into the
 * base protocol (enabled, or a rev2-only server). Anything else gets imapflow's COPY + \Deleted + EXPUNGE
 * fallback, which this client never lets run. An advertised but not enabled IMAP4rev2 is not enough.
 */
function hasNativeMove(connection: ImapFlow): boolean {
    const { capabilities, enabled } = connection;

    return capabilities.has('MOVE') ||
        enabled.has('IMAP4REV2') ||
        (capabilities.has('IMAP4rev2') && !capabilities.has('IMAP4rev1'));
}

/** The listed `\Trash` folder, by the server's flag only: imapflow's guess from a folder's name is not taken. */
export function trashFolderOf(listed: ListResponse[]): string | undefined {
    const trash = listed.find((folder) => !folder.flags.has('\\Noselect') &&
        !folder.flags.has('\\NonExistent') &&
        (folder.flags.has('\\Trash') || (folder.specialUse === '\\Trash' && folder.specialUseSource !== 'name')));

    return trash?.path;
}

/**
 * The trash folder and the targets grouped by folder (input order), after the checks no folder is opened for:
 * every folder listed and allowed and none the trash (ValidationError), a native MOVE (without it
 * imapflow would COPY, STORE \Deleted and EXPUNGE) and a `\Trash` folder.
 */
async function prepareMailDelete(
    pool: MailConnectionPool,
    connection: ImapFlow,
    account: MailAccountNormalized,
    targets: MailDeleteTarget[],
): Promise<{ trash: string; groups: Map<string, MailDeleteTarget[]> }> {
    const listed = await pool.folders(connection, account);
    const trash = trashFolderOf(listed);
    const groups = new Map<string, MailDeleteTarget[]>();

    for (const target of targets) {
        if (!isAllowedFolder(account, listed, target.folder)) {
            throw new ValidationError('ids name a folder this account does not read: search again.');
        }

        if (target.folder === trash) {
            throw new ValidationError('ids name a mail in the trash folder: leave it out, a mail in the trash is not deleted again.');
        }

        groups.set(target.folder, [...groups.get(target.folder) ?? [], target]);
    }

    if (!hasNativeMove(connection)) {
        throw requestError(TOOL, account.id, 'move not supported');
    }

    if (!trash) {
        throw requestError(TOOL, account.id, 'no trash folder');
    }

    return { trash, groups };
}

/** The ids of `targets` in input order, split by `done`. */
function splitTargets(targets: MailDeleteTarget[], done: Set<string>): { done: string[]; missing: string[] } {
    return {
        done: targets.filter((target) => done.has(target.id)).map((target) => target.id),
        missing: targets.filter((target) => !done.has(target.id)).map((target) => target.id),
    };
}

/** The mails of `targets` (EXAMINE, ENVELOPE and INTERNALDATE only), gone or stale ones as missing. */
export async function describeMails(
    pool: MailConnectionPool,
    account: MailAccountNormalized,
    targets: MailDeleteTarget[],
    signal?: AbortSignal,
): Promise<MailDeleteListing> {
    return pool.run(TOOL, account, signal, async (connection) => {
        const { trash, groups } = await prepareMailDelete(pool, connection, account, targets);
        const items = new Map<string, MailDeleteItem>();

        for (const [folder, group] of groups) {
            await openMailFolder(connection, folder, async (uidValidity) => {
                const current = group.filter((target) => target.uidValidity === uidValidity);

                if (current.length === 0) {
                    return;
                }

                const fetched = await connection.fetchAll(current.map((target) => target.uid).join(','), MAIL_DATE_QUERY, { uid: true });
                const byUid = new Map(fetched.map((message) => [message.uid, message]));

                for (const target of current) {
                    const message = byUid.get(target.uid);

                    if (message) {
                        items.set(target.id, {
                            id: target.id,
                            folder,
                            from: addressListOf(message.envelope?.from),
                            subject: subjectOf(message.envelope?.subject),
                            date: dateOf(message).toISOString(),
                        });
                    }
                }
            });
        }

        const { missing } = splitTargets(targets, new Set(items.keys()));

        return {
            account: account.id,
            trash,
            mails: targets.flatMap((target) => items.get(target.id) ?? []),
            missing,
        };
    });
}

/** The targets of one folder that are still there (EXAMINE, UID FETCH of the uids). */
async function presentTargets(connection: ImapFlow, folder: string, group: MailDeleteTarget[]): Promise<MailDeleteTarget[]> {
    return openMailFolder(connection, folder, async (uidValidity) => {
        const current = group.filter((target) => target.uidValidity === uidValidity);

        if (current.length === 0) {
            return [];
        }

        const fetched = await connection.fetchAll(current.map((target) => target.uid).join(','), { uid: true }, { uid: true });
        const uids = new Set(fetched.map((message) => message.uid));

        return current.filter((target) => uids.has(target.uid));
    });
}

/**
 * Moves the mails of `targets` to the trash, one folder after another: the present uids are found under
 * EXAMINE, then the folder is SELECTed for its one `UID MOVE` only. The lock is released without CLOSE (which
 * would expunge every `\Deleted` mail); the next open switches the folder with EXAMINE or SELECT, which
 * expunges nothing (RFC 3501 6.3.1).
 */
export async function trashMails(
    pool: MailConnectionPool,
    account: MailAccountNormalized,
    targets: MailDeleteTarget[],
    signal?: AbortSignal,
): Promise<MailDeleteResult> {
    return pool.run(TOOL, account, signal, async (connection) => {
        const { trash, groups } = await prepareMailDelete(pool, connection, account, targets);
        const moved = new Set<string>();

        for (const [folder, group] of groups) {
            const present = await presentTargets(connection, folder, group);

            if (present.length === 0) {
                continue;
            }

            const lock = await connection.getMailboxLock(folder);

            try {
                const { mailbox } = connection;

                // the folder may have changed between the EXAMINE and the SELECT
                if (!mailbox || String(mailbox.uidValidity) !== present[0]!.uidValidity) {
                    continue;
                }

                const result = await connection.messageMove(present.map((target) => target.uid).join(','), trash, { uid: true });

                if (!result) {
                    throw requestError(TOOL, account.id, 'request failed');
                }

                for (const target of present) {
                    // with COPYUID, a uid it does not map was gone by the time of the move
                    if (!result.uidMap || result.uidMap.has(target.uid)) {
                        moved.add(target.id);
                    }
                }
            } finally {
                lock.release();
            }
        }

        const { done, missing } = splitTargets(targets, moved);

        return {
            account: account.id,
            trash,
            moved: done,
            missing,
        };
    });
}
