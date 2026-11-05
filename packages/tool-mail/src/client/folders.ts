/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ListResponse } from 'imapflow';
import type { MailAccountNormalized } from '../options/types.ts';
import { MAIL_EXCLUDED_FOLDER_NAMES } from './constants.ts';

const SPECIAL_USES = ['\\All', '\\Sent', '\\Trash', '\\Junk'];

/** imapflow's special use, else a special-use flag the server listed without announcing SPECIAL-USE. */
function specialUseOf(folder: ListResponse): string | undefined {
    return folder.specialUse ?? SPECIAL_USES.find((flag) => folder.flags.has(flag));
}

function selectable(folder: ListResponse): boolean {
    return !folder.flags.has('\\Noselect') && !folder.flags.has('\\NonExistent');
}

function excluded(folder: ListResponse): boolean {
    return specialUseOf(folder) === '\\Trash' ||
        specialUseOf(folder) === '\\Junk' ||
        MAIL_EXCLUDED_FOLDER_NAMES.test(folder.path);
}

/** The listed folders of the account's configured set, else every selectable listed folder. */
function configured(account: MailAccountNormalized, listed: ListResponse[]): ListResponse[] | undefined {
    if (!account.folders) {
        return undefined;
    }

    const names = new Set(account.folders);

    return listed.filter((folder) => selectable(folder) && names.has(folder.path));
}

function sentOf(listed: ListResponse[]): ListResponse[] {
    return listed.filter((folder) => selectable(folder) && specialUseOf(folder) === '\\Sent');
}

function unique(folders: ListResponse[]): string[] {
    return [...new Set(folders.map((folder) => folder.path))];
}

/** The folders `mail_search` reads without a `folder`: the configured ones, on Gmail All Mail, else all but trash and spam. */
export function searchFolders(account: MailAccountNormalized, listed: ListResponse[]): string[] {
    const folders = configured(account, listed);

    if (folders) {
        return unique(folders);
    }

    if (account.gmail) {
        const all = listed.filter((folder) => selectable(folder) && specialUseOf(folder) === '\\All');

        if (all.length > 0) {
            return unique(all);
        }
    }

    return unique(listed.filter((folder) => selectable(folder) && !excluded(folder)));
}

/** The folders `mail_thread` reads: the search folders plus Sent (on Gmail All Mail holds both). */
export function threadFolders(account: MailAccountNormalized, listed: ListResponse[]): string[] {
    const folders = searchFolders(account, listed);

    if (account.gmail && !account.folders && folders.length === 1) {
        return folders;
    }

    return [...new Set([...folders, ...unique(sentOf(listed))])];
}

/** Whether a mail id or a `folder` input may name `path`: a listed folder of the account's set (or Sent). */
export function isAllowedFolder(account: MailAccountNormalized, listed: ListResponse[], path: string): boolean {
    const folders = configured(account, listed);

    if (!folders) {
        return listed.some((folder) => selectable(folder) && folder.path === path);
    }

    return [...folders, ...sentOf(listed)].some((folder) => folder.path === path);
}
