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
    optionalBoolean,
    optionalDate,
    optionalInteger,
    optionalString,
    requireString,
    signalOf,
} from './asserts.ts';
import { UNTRUSTED_NOTE } from './constants.ts';
import type { MailClientSource } from './types.ts';

type MailSearchToolInput = {
    account: string;
    query?: string;
    folder?: string;
    from?: string;
    to?: string;
    subject?: string;
    since?: string;
    before?: string;
    unread?: boolean;
    limit?: number;
};

export function mailSearchTool(source: MailClientSource): Tool<MailSearchToolInput, MailSearchResult> {
    return defineTool<MailSearchToolInput, MailSearchResult>({
        trust: { taint: true },
        description: 'Search one mail account, newest first: headers and a short snippet per mail, ' +
            'with an id for mail_get, mail_attachment and mail_thread. Without folder it searches every folder but ' +
            'trash and spam (Gmail: All Mail). truncated says more mails matched than limit. ' +
            `Read only: nothing in a mailbox changes, mails stay unread. ${UNTRUSTED_NOTE}`,
        inputSchema: objectSchema<MailSearchToolInput>({
            account: {
                type: 'string',
                minLength: 1,
                description: 'The account, from mail_accounts.',
            },
            query: {
                type: 'string',
                minLength: 1,
                description: 'Full text to find. On Gmail accounts Gmail search syntax (from:, has:attachment, ...).',
            },
            folder: {
                type: 'string',
                minLength: 1,
                description: 'One folder path from mail_accounts. Default: the account\'s search folders.',
            },
            from: {
                type: 'string',
                minLength: 1,
                description: 'Sender contains this.',
            },
            to: {
                type: 'string',
                minLength: 1,
                description: 'Recipient contains this.',
            },
            subject: {
                type: 'string',
                minLength: 1,
                description: 'Subject contains this.',
            },
            since: { type: 'string', description: 'Received on or after this ISO date (2026-11-04).' },
            before: { type: 'string', description: 'Received before this ISO date.' },
            unread: { type: 'boolean', description: 'Only unread mails.' },
            limit: {
                type: 'integer',
                minimum: 1,
                maximum: MAIL_SEARCH_MAX_LIMIT,
                description: `Mails to return (default ${MAIL_SEARCH_DEFAULT_LIMIT}).`,
            },
        }, ['account']),
        execute: async (input, { abortSignal, context }) => {
            const body = inputObject(input);
            const account = requireString(body.account, 'account');
            const query = optionalString(body.query, 'query');
            const folder = optionalString(body.folder, 'folder');
            const from = optionalString(body.from, 'from');
            const to = optionalString(body.to, 'to');
            const subject = optionalString(body.subject, 'subject');
            const since = optionalDate(body.since, 'since');
            const before = optionalDate(body.before, 'before');
            const unread = optionalBoolean(body.unread, 'unread');
            const limit = optionalInteger(body.limit, 'limit', 1, MAIL_SEARCH_MAX_LIMIT);

            return source(context).search({
                account,
                ...(query !== undefined && { query }),
                ...(folder !== undefined && { folder }),
                ...(from !== undefined && { from }),
                ...(to !== undefined && { to }),
                ...(subject !== undefined && { subject }),
                ...(since && { since }),
                ...(before && { before }),
                ...(unread !== undefined && { unread }),
                ...(limit !== undefined && { limit }),
            }, signalOf(abortSignal, context));
        },
    });
}
