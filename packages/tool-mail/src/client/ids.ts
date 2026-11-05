/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import { ACCOUNT_ID_PATTERN } from '../options/constants.ts';
import type { MailIdParts } from './types.ts';

const UID_MAX = 0xFFFFFFFF;

/** An opaque mail id: `<account>:<base64url(folder)>:<uidValidity>:<uid>`. */
export function encodeMailId(parts: MailIdParts): string {
    return [
        parts.account,
        Buffer.from(parts.folder, 'utf8').toString('base64url'),
        parts.uidValidity,
        String(parts.uid),
    ].join(':');
}

/** The parts of a mail id; a ValidationError for anything `encodeMailId` did not issue. */
export function parseMailId(id: unknown): MailIdParts {
    const invalid = new ValidationError('id is not a mail id: take it from mail_search or mail_thread.');

    if (typeof id !== 'string') {
        throw invalid;
    }

    const parts = id.split(':');

    if (parts.length !== 4) {
        throw invalid;
    }

    const [account, folder, uidValidity, uid] = parts as [string, string, string, string];

    if (
        !ACCOUNT_ID_PATTERN.test(account) ||
        !/^[\w-]+$/.test(folder) ||
        !/^(0|[1-9]\d{0,19})$/.test(uidValidity) ||
        !/^[1-9]\d{0,9}$/.test(uid) ||
        Number(uid) > UID_MAX
    ) {
        throw invalid;
    }

    const path = Buffer.from(folder, 'base64url').toString('utf8');

    if (Buffer.from(path, 'utf8').toString('base64url') !== folder) {
        throw invalid;
    }

    return {
        account,
        folder: path,
        uidValidity,
        uid: Number(uid),
    };
}
