/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import type { FetchMessageObject, ImapFlow, MessageAddressObject } from 'imapflow';
import { MAIL_ADDRESSES_MAX_CHARS, MAIL_SUBJECT_MAX_CHARS } from '../text/constants.ts';
import { addresses, cutText, stripHtml } from '../text/module.ts';
import { MAIL_DATE_QUERY, MAIL_SEARCH_DATE_CANDIDATES, MAIL_SNIPPET_CHARS } from './constants.ts';

/**
 * The `limit` newest of `uids` (sorted descending) by `dateOf()`, newer uid first on equal dates; only the first
 * `MAIL_SEARCH_DATE_CANDIDATES` are dated.
 */
export async function newestByDate(connection: ImapFlow, uids: number[], limit: number): Promise<number[]> {
    const candidates = uids.slice(0, MAIL_SEARCH_DATE_CANDIDATES);
    const dated = await connection.fetchAll(candidates, MAIL_DATE_QUERY, { uid: true });

    return dated
        .map((message) => ({ uid: message.uid, time: dateOf(message).getTime() }))
        .sort((a, b) => b.time - a.time || b.uid - a.uid)
        .slice(0, limit)
        .map((entry) => entry.uid);
}

export function dateOf(message: FetchMessageObject): Date {
    const envelope = message.envelope?.date;

    if (envelope instanceof Date && !Number.isNaN(envelope.getTime())) {
        return envelope;
    }

    const internal = message.internalDate;

    return internal instanceof Date ? internal : new Date(0);
}

/** An address list, cut at `MAIL_ADDRESSES_MAX_CHARS`. */
export function addressListOf(value: MessageAddressObject[] | undefined): string {
    return cutText(addresses(value?.map((entry) => ({
        ...(entry.name && { name: entry.name }),
        ...(entry.address && { address: entry.address }),
    }))), 0, MAIL_ADDRESSES_MAX_CHARS);
}

/** A subject, cut at `MAIL_SUBJECT_MAX_CHARS`. */
export function subjectOf(value: string | undefined): string {
    return cutText(value ?? '', 0, MAIL_SUBJECT_MAX_CHARS);
}

/** The `<...>` message ids in a header value. */
export function messageIds(value: string): string[] {
    return value.match(/<[^<>\s]+>/g) ?? [];
}

/** Header values by lower-cased name, folded lines joined. */
export function headerValues(data: Uint8Array | undefined): Map<string, string> {
    const values = new Map<string, string>();
    const text = Buffer.from(data ?? new Uint8Array(0)).toString('utf8').replace(/\r?\n[ \t]+/g, ' ');

    for (const line of text.split(/\r?\n/)) {
        const colon = line.indexOf(':');

        if (colon > 0) {
            const name = line.slice(0, colon).trim().toLowerCase();

            values.set(name, `${values.get(name) ?? ''} ${line.slice(colon + 1).trim()}`.trim());
        }
    }

    return values;
}

export function snippetOf(text: string, html: boolean): string {
    const plain = html ? stripHtml(text) : text;

    return plain.replace(/\s+/g, ' ').trim().slice(0, MAIL_SNIPPET_CHARS);
}

export function pageOf(text: string, offset: number, max: number) {
    if (offset > 0 && offset >= text.length) {
        throw new ValidationError(`offset ${offset} is past the end (${text.length} characters).`);
    }

    const content = cutText(text, offset, max);
    const next = offset + content.length;

    return {
        content,
        offset,
        totalChars: text.length,
        ...(next < text.length && { nextOffset: next }),
    };
}
