/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { FetchMessageObject, ImapFlow, SearchObject } from 'imapflow';
import type { MailAccountNormalized } from '../options/types.ts';
import { MAIL_SNIPPET_BYTES, MAIL_SUMMARY_QUERY } from './constants.ts';
import { encodeMailId } from './ids.ts';
import { openMailFolder } from './mailbox.ts';
import {
    addressListOf,
    dateOf,
    newestByDate,
    snippetOf,
    subjectOf,
} from './message.ts';
import {
    attachmentsOf,
    decodeText,
    sectionOf,
    textPartOf,
} from './structure.ts';
import type {
    MailFound,
    MailIdParts,
    MailSearchInput,
    MailSearchResult,
} from './types.ts';

export function mailSearchCriteria(input: MailSearchInput, account: MailAccountNormalized): SearchObject {
    const criteria: SearchObject = {};

    if (input.query !== undefined) {
        if (account.gmail) {
            criteria.gmraw = input.query;
        } else {
            criteria.text = input.query;
        }
    }

    for (const name of ['from', 'to', 'subject', 'since', 'before'] as const) {
        if (input[name] !== undefined) {
            Object.assign(criteria, { [name]: input[name] });
        }
    }

    if (input.unread) {
        criteria.seen = false;
    }

    return Object.keys(criteria).length > 0 ? criteria : { all: true };
}

/** The first `MAIL_SNIPPET_BYTES` of each mail's first text part, one fetch per distinct section. */
export async function fetchMailSnippets(connection: ImapFlow, messages: FetchMessageObject[]): Promise<Map<number, string>> {
    const sections = new Map<string, FetchMessageObject[]>();

    for (const message of messages) {
        const part = message.bodyStructure ? textPartOf(message.bodyStructure) : undefined;

        if (part) {
            const section = sectionOf(part);

            sections.set(section, [...(sections.get(section) ?? []), message]);
        }
    }

    const snippets = new Map<number, string>();

    for (const [section, group] of sections) {
        const fetched = await connection.fetchAll(
            group.map((message) => message.uid),
            {
                uid: true,
                bodyParts: [{
                    key: section,
                    start: 0,
                    maxLength: MAIL_SNIPPET_BYTES,
                }],
            },
            { uid: true },
        );

        for (const message of fetched) {
            const data = message.bodyParts?.get(section.toLowerCase());
            const part = group.find((entry) => entry.uid === message.uid)?.bodyStructure;
            const node = part ? textPartOf(part) : undefined;

            if (data && node) {
                snippets.set(message.uid, snippetOf(decodeText(data, node), node.type === 'text/html'));
            }
        }
    }

    return snippets;
}

/** One folder's newest `limit` matches as summaries, `skip` left out; `total` counts every match. */
export async function searchMailFolder(
    connection: ImapFlow,
    account: MailAccountNormalized,
    folder: string,
    criteria: SearchObject,
    limit: number,
    skip?: MailIdParts,
): Promise<{ found: MailFound[]; total: number }> {
    return openMailFolder(connection, folder, async (uidValidity) => {
        // strict: an answer read only in part (an invalid or capped uid list) fails the search instead of
        // returning fewer matches and a short `total`
        const matched = (await connection.search(criteria, { uid: true, strict: true })) || [];
        const uids = matched
            .filter((uid) => !(skip && skip.folder === folder && skip.uid === uid))
            .sort((a, b) => b - a);
        const wanted = uids.length > limit ? await newestByDate(connection, uids, limit) : uids;

        if (wanted.length === 0) {
            return { found: [], total: uids.length };
        }

        const messages = await connection.fetchAll(wanted, MAIL_SUMMARY_QUERY, { uid: true });
        const snippets = await fetchMailSnippets(connection, messages);
        const found = messages.map((message): MailFound => {
            const envelope = message.envelope ?? {};
            const date = dateOf(message);

            return {
                summary: {
                    id: encodeMailId({
                        account: account.id,
                        folder,
                        uidValidity,
                        uid: message.uid,
                    }),
                    account: account.id,
                    folder,
                    date: date.toISOString(),
                    from: addressListOf(envelope.from),
                    to: addressListOf(envelope.to),
                    subject: subjectOf(envelope.subject),
                    snippet: snippets.get(message.uid) ?? '',
                    unread: !message.flags?.has('\\Seen'),
                    hasAttachments: attachmentsOf(message.bodyStructure).length > 0,
                },
                time: date.getTime(),
                ...(envelope.messageId && { messageId: envelope.messageId }),
            };
        });

        return { found, total: uids.length };
    });
}

export function mergeMailSummaries(found: MailFound[], limit: number, total: number): MailSearchResult {
    const mails = found
        .sort((a, b) => b.time - a.time)
        .slice(0, limit)
        .map((entry) => entry.summary);

    return { mails, truncated: total > mails.length };
}
