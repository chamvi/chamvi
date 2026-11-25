/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolContext, ToolLimit } from '@chamvi/core';
import { isObject } from 'smob';
import { parseMailId } from '../client/ids.ts';
import { injectMailWriteContext } from '../context/module.ts';
import { deleteListingOf, lineOf } from './approval.ts';
import { MAIL_DELETE_LIMIT_BUCKET, MAIL_DELETE_LIMIT_MAX, MAIL_DELETE_LIMIT_WINDOW_MS } from './constants.ts';
import type { MailDeleteInput, MailDeleteLimitOptions, MailWriteClientSource } from './types.ts';

/** The distinct string ids of an input; none for a malformed one (the tool refuses it). */
function idsOf(input: unknown): string[] {
    const ids = isObject(input) && Array.isArray(input.ids) ? input.ids : [];

    return [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
}

/** `<folder> uid <uid>` per id, from the id alone. */
function fallbackListingOf(ids: string[]): string {
    return ids.map((id) => {
        try {
            const parts = parseMailId(id);

            return `${lineOf(parts.folder)} uid ${parts.uid}`;
        } catch {
            return lineOf(id);
        }
    }).join('\n');
}

/** The delete limit over a client source (internal): `mail_delete`'s own limit uses the factory's. */
export function mailDeleteLimitOf(source: MailWriteClientSource, options: Omit<MailDeleteLimitOptions, 'client'> = {}): ToolLimit<MailDeleteInput> {
    return {
        max: options.max ?? MAIL_DELETE_LIMIT_MAX,
        windowMs: options.windowMs ?? MAIL_DELETE_LIMIT_WINDOW_MS,
        bucket: options.bucket ?? MAIL_DELETE_LIMIT_BUCKET,
        onExceed: 'approve',
        weight: (input) => Math.max(1, idsOf(input).length),
        // the approval's body: the listing, else what the ids alone tell; never a throw
        detail: async (input, ctx: ToolContext) => {
            const ids = idsOf(input);

            try {
                const listing = await source(ctx).describe(ids, ctx.run.signal);

                return deleteListingOf(listing.mails);
            } catch {
                return fallbackListingOf(ids);
            }
        },
    };
}

/**
 * The rate limit of `mail_delete`: at most `max` mails (default 20) moved per `windowMs` (default one hour) in
 * `bucket` (default `deletes`); a call over it asks the owner with the listing of its mails. A call's weight is
 * its number of distinct ids. `mail_delete` carries it as its own limit; an agent's `limits.mail_delete`
 * replaces it whole, so take this one to change only `max` or `windowMs`. Without `client` the listing comes
 * from the write client provided on the engine.
 */
export function mailDeleteLimit(options: MailDeleteLimitOptions = {}): ToolLimit<MailDeleteInput> {
    const { client, ...rest } = options;

    return mailDeleteLimitOf(client ? () => client : (ctx) => injectMailWriteContext(ctx), rest);
}
