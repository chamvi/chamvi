/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { defineTool } from '@chamvi/core';
import { MAIL_SEARCH_DEFAULT_LIMIT, MAIL_SEARCH_MAX_LIMIT } from '../client/constants.ts';
import type { MailSearchResult } from '../client/types.ts';
import {
    inputObject,
    objectSchema,
    optionalInteger,
    requireString,
    signalOf,
    taintOf,
} from './asserts.ts';
import { UNTRUSTED_NOTE } from './constants.ts';
import type { MailClientSource } from './types.ts';

type MailThreadToolInput = {
    id: string;
    limit?: number;
};

export function mailThreadTool(source: MailClientSource): Tool<MailThreadToolInput, MailSearchResult> {
    return defineTool<MailThreadToolInput, MailSearchResult>({
        trust: { taint: taintOf(source) },
        description: 'The other mails of a mail\'s thread (replies and what it answers), newest first, across the account\'s ' +
            'folders including Sent, in the shape of mail_search. ' +
            `Read only: nothing in a mailbox changes. ${UNTRUSTED_NOTE}`,
        inputSchema: objectSchema<MailThreadToolInput>({
            id: {
                type: 'string',
                minLength: 1,
                description: 'A mail id from mail_search.',
            },
            limit: {
                type: 'integer',
                minimum: 1,
                maximum: MAIL_SEARCH_MAX_LIMIT,
                description: `Mails to return (default ${MAIL_SEARCH_DEFAULT_LIMIT}).`,
            },
        }, ['id']),
        execute: async (input, { abortSignal, context }) => {
            const body = inputObject(input);
            const id = requireString(body.id, 'id');
            const limit = optionalInteger(body.limit, 'limit', 1, MAIL_SEARCH_MAX_LIMIT);

            return source(context).thread(id, limit, signalOf(abortSignal, context));
        },
    });
}
