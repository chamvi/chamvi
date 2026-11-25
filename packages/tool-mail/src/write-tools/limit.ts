/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { once } from '@chamvi/core';
import type { ToolContext, ToolLimit } from '@chamvi/core';
import { isObject } from 'smob';
import { parseMailId } from '../client/ids.ts';
import { deleteListingOf, lineOf } from './approval.ts';
import {
    MAIL_DELETE_LIMIT_BUCKET,
    MAIL_DELETE_LIMIT_MAX,
    MAIL_DELETE_LIMIT_WINDOW_MS,
    MAIL_DELETE_LISTING_ONCE,
} from './constants.ts';
import type {
    MailDeleteInput,
    MailDeleteLimitSettings,
    MailDeleteShown,
    MailWriteClientSource,
} from './types.ts';

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

/**
 * The limit `mail_delete` carries (internal): at most `max` mails (default 20) moved per `windowMs` (default one
 * hour) in `bucket` (default `deletes`), a call weighing its distinct ids, over it an approval with the listing of
 * its mails through the tools' own client. What the owner was shown is recorded per call (`once()`): the ids of a
 * real listing, or null when only the fallback could be shown, so `execute` skips its own checks only after an
 * approval that showed every mail.
 */
export function mailDeleteLimitOf(source: MailWriteClientSource, settings: MailDeleteLimitSettings = {}): ToolLimit<MailDeleteInput> {
    return {
        max: settings.max ?? MAIL_DELETE_LIMIT_MAX,
        windowMs: settings.windowMs ?? MAIL_DELETE_LIMIT_WINDOW_MS,
        bucket: settings.bucket ?? MAIL_DELETE_LIMIT_BUCKET,
        onExceed: 'approve',
        weight: (input) => Math.max(1, idsOf(input).length),
        // the approval's body: the listing, else what the ids alone tell; never a throw
        detail: async (input, ctx: ToolContext) => {
            const ids = idsOf(input);
            let text: string | undefined;
            const shown = await once<MailDeleteShown | null>(ctx, MAIL_DELETE_LISTING_ONCE, async () => {
                try {
                    const listing = await source(ctx).describe(ids, ctx.run.signal);

                    text = deleteListingOf(listing.mails);

                    return { ids: [...listing.mails.map((mail) => mail.id), ...listing.missing] };
                } catch {
                    return null;
                }
            });

            if (shown === null) {
                return fallbackListingOf(ids);
            }

            // a recorded listing asked again (a changed input): its text is not kept, the ids alone tell
            return text ?? fallbackListingOf(ids);
        },
    };
}

/** Whether the limit approval of this call showed every mail of `ids` (read in `execute`, null when it never ran). */
export async function limitListingCovers(ctx: ToolContext, ids: string[]): Promise<boolean> {
    const shown = await once<MailDeleteShown | null>(ctx, MAIL_DELETE_LISTING_ONCE, async () => null);

    if (!shown) {
        return false;
    }

    const listed = new Set(shown.ids);

    return ids.every((id) => listed.has(id));
}
