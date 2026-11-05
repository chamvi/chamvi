/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MAIL_HTML_MAX_CHARS, MAIL_INVITE_FIELD_MAX_CHARS } from './constants.ts';
import type { MailAddress } from './types.ts';

const BREAK_TAG = /(br|\/p|\/div|\/tr|\/li|\/h[1-4]|\/table)\b/iy;

const ICS_LABELS: Record<string, string> = {
    METHOD: 'Method',
    SUMMARY: 'Title',
    DTSTART: 'Start',
    DTEND: 'End',
    LOCATION: 'Location',
    ORGANIZER: 'Organizer',
    STATUS: 'Status',
};

/** `text` from `offset`, at most `max` UTF-16 units, never ending inside a surrogate pair. */
export function cutText(text: string, offset: number, max: number): string {
    const end = offset + max;

    if (end >= text.length) {
        return text.slice(offset);
    }

    const code = text.charCodeAt(end - 1);

    return text.slice(offset, code >= 0xD800 && code <= 0xDBFF ? end - 1 : end);
}

/** ASCII-only lower case: keeps every index of the input valid (`toLowerCase` may change the length). */
function lowerAscii(input: string): string {
    return input.replace(/[A-Z]+/g, (match) => match.toLowerCase());
}

/** Drops every `<tag ...>...</tag ...>` element; an unclosed element runs to the end. */
function dropElements(html: string, tag: string): string {
    const lower = lowerAscii(html);
    const parts: string[] = [];
    let position = 0;

    while (position < html.length) {
        const start = lower.indexOf(`<${tag}`, position);

        if (start === -1) {
            break;
        }

        parts.push(html.slice(position, start));

        const end = lower.indexOf(`</${tag}`, start);

        position = end === -1 ?
            html.length :
            (lower.indexOf('>', end) + 1 || html.length);
    }

    parts.push(html.slice(position));

    return parts.join('');
}

/** Replaces each `<br ...>`, `</p ...>`, ... up to its `>` by a line break. */
function breakTags(html: string): string {
    const parts: string[] = [];
    let position = 0;
    let search = 0;

    for (;;) {
        const start = html.indexOf('<', search);

        if (start === -1) {
            break;
        }

        BREAK_TAG.lastIndex = start + 1;

        if (!BREAK_TAG.test(html)) {
            search = start + 1;

            continue;
        }

        const close = html.indexOf('>', BREAK_TAG.lastIndex);

        if (close === -1) {
            // no `>` follows: no later tag can close either
            break;
        }

        parts.push(html.slice(position, start), '\n');
        position = close + 1;
        search = position;
    }

    parts.push(html.slice(position));

    return parts.join('');
}

/** Removes every `<...>`; a `<` without a later `>` stays text, and so does the rest. */
function dropTags(html: string): string {
    const parts: string[] = [];
    let position = 0;

    for (;;) {
        const start = html.indexOf('<', position);

        if (start === -1) {
            break;
        }

        const close = html.indexOf('>', start);

        if (close === -1) {
            break;
        }

        parts.push(html.slice(position, start));
        position = close + 1;
    }

    parts.push(html.slice(position));

    return parts.join('');
}

function codePoint(digits: string): string {
    const value = Number(digits);

    if (!Number.isSafeInteger(value)) {
        return '�';
    }

    return String.fromCodePoint(value % 0x110000);
}

/**
 * HTML to text in linear time: no backtracking regular expression runs on the untrusted input.
 * The input is cut at `MAIL_HTML_MAX_CHARS` first; script and style elements are dropped (an unterminated one
 * to the end), block ends become line breaks, entities are decoded once.
 */
export function stripHtml(input: string): string {
    let html = input.slice(0, MAIL_HTML_MAX_CHARS);

    for (const tag of ['script', 'style']) {
        html = dropElements(html, tag);
    }

    const text = dropTags(breakTags(html))
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, '\'')
        .replace(/&#(\d+);/g, (_, digits: string) => codePoint(digits))
        .replace(/&amp;/g, '&');

    return text.replace(/\n\s*\n+/g, '\n\n').trim();
}

/**
 * The searchable fields of the first VEVENT of an iCalendar text (RFC 5545 lines unfolded), one `- Label: value`
 * line each, plus the attendee count. METHOD comes from the calendar header; a VTIMEZONE before the event and
 * the event's VALARMs are ignored. Each value is cut at `MAIL_INVITE_FIELD_MAX_CHARS`. Empty when nothing is found.
 */
export function icsSummary(data: string): string {
    const text = data.replace(/\r?\n[ \t]/g, '');
    const fields = new Map<string, string>();
    let attendees = 0;

    const method = /^METHOD:(.*)$/im.exec(text);

    if (method) {
        fields.set('Method', cutText(method[1]!.trim(), 0, MAIL_INVITE_FIELD_MAX_CHARS));
    }

    const begin = text.search(/^BEGIN:VEVENT/im);
    const end = begin === -1 ? -1 : text.slice(begin).search(/^END:VEVENT/im);
    let event: string;

    if (begin === -1) {
        event = text;
    } else {
        event = text.slice(begin, end === -1 ? undefined : begin + end);
    }

    for (const line of event.split(/\r?\n/)) {
        const colon = line.indexOf(':');

        if (colon === -1) {
            continue;
        }

        const [name, ...params] = line.slice(0, colon).split(';');
        const key = name!.toUpperCase();

        if (key === 'ATTENDEE') {
            attendees++;

            continue;
        }

        const label = ICS_LABELS[key];

        if (!label || fields.has(label)) {
            continue;
        }

        const value = line.slice(colon + 1)
            .replace(/mailto:/gi, '')
            .replace(/\\,/g, ',')
            .replace(/\\n/g, ' ');
        const tz = params.find((param) => param.toUpperCase().startsWith('TZID='))?.slice(5);

        fields.set(label, cutText(tz ? `${value} (${tz})` : value, 0, MAIL_INVITE_FIELD_MAX_CHARS));
    }

    if (fields.size === 0) {
        return '';
    }

    const lines = [...fields].map(([label, value]) => `- ${label}: ${value}`);

    if (attendees) {
        lines.push(`- Attendees: ${attendees}`);
    }

    return lines.join('\n');
}

function flatten(entry: MailAddress): string[] {
    if (entry.group) {
        return entry.group.flatMap(flatten);
    }

    if (entry.name) {
        return [`${entry.name} <${entry.address}>`];
    }

    return [entry.address ?? ''];
}

/** A comma-separated address list: groups flattened, `Name <address>` or the bare address, empty entries dropped. */
export function addresses(list: MailAddress | MailAddress[] | undefined): string {
    let entries: MailAddress[];

    if (Array.isArray(list)) {
        entries = list;
    } else {
        entries = list ? [list] : [];
    }

    return entries.flatMap(flatten).filter(Boolean).join(', ');
}
