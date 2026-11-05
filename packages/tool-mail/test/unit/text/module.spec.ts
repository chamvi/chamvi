/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { MAIL_HTML_MAX_CHARS, MAIL_INVITE_FIELD_MAX_CHARS } from '../../../src/text/constants.ts';
import { addresses, icsSummary, stripHtml } from '../../../src/text/module.ts';

describe('stripHtml', () => {
    it('drops an unterminated script and decodes numeric entities', () => {
        expect(stripHtml('before<script>alert(1)')).toBe('before');
        expect(stripHtml('a<STYLE>x</style >b')).toBe('ab');
        expect(stripHtml('&#8364; &#128512; &amp;lt;')).toBe('€ \u{1F600} &lt;');
        expect(stripHtml('x<br>y<p>z</p>\n\n\n\nw')).toBe('x\nyz\n\nw');
    });

    it('strips an HTML-only body', () => {
        const html = [
            '<html><head><style>p { color: red }</style><script>alert(1)</script></head>',
            '<body><p>Tom &amp; Jerry &lt;3</p><div>caf&#233;&nbsp;now</div></body></html>',
            '',
        ].join('\n');
        const text = stripHtml(html);

        expect(text).toBe('Tom & Jerry <3\ncafé now');
        expect(text).not.toContain('alert');
        expect(text).not.toContain('color');
    });

    it('keeps a tag without a closing bracket as text', () => {
        expect(stripHtml('a <b>bold</b> c < d')).toBe('a bold c < d');
        expect(stripHtml('<a <br>x')).toBe('<a \nx');
    });

    it('replaces an out-of-range numeric entity instead of throwing', () => {
        expect(stripHtml(`&#${'9'.repeat(400)};`)).toBe('�');
    });

    it('cuts the input before stripping', () => {
        const text = stripHtml('a'.repeat(MAIL_HTML_MAX_CHARS + 10));

        expect(text).toHaveLength(MAIL_HTML_MAX_CHARS);
    });

    it('returns within a second for 5 MB of HTML with an unterminated <script', () => {
        const html = `<p>start</p>${'<div>x</div>'.repeat(1000)}<script>${'a<b'.repeat(1_700_000)}`;

        expect(html.length).toBeGreaterThan(5_000_000);

        const started = performance.now();
        const text = stripHtml(html);

        expect(performance.now() - started).toBeLessThan(1000);
        expect(text.startsWith('start')).toBe(true);
        expect(text).not.toContain('a<b');
    });

    it('returns within a second for hostile tag soup', () => {
        const cases = [
            '<'.repeat(5_000_000),
            '<br'.repeat(1_700_000),
            '<script></script>'.repeat(300_000),
            '&#'.repeat(2_500_000),
        ];

        for (const html of cases) {
            const started = performance.now();

            stripHtml(html);
            expect(performance.now() - started).toBeLessThan(1000);
        }
    });
});

describe('icsSummary', () => {
    it('cuts every field value', () => {
        const huge = 'z'.repeat(100_000);
        const summary = icsSummary([
            `METHOD:${huge}`,
            'BEGIN:VEVENT',
            `SUMMARY:${huge}`,
            `LOCATION:${huge}`,
            `DTSTART;TZID=${huge}:20261110T090000`,
            'END:VEVENT',
        ].join('\r\n'));
        const lines = summary.split('\n');

        expect(lines).toHaveLength(4);

        for (const line of lines) {
            expect(line.slice(line.indexOf(': ') + 2)).toHaveLength(MAIL_INVITE_FIELD_MAX_CHARS);
        }
    });

    it('returns nothing for empty or field-less input', () => {
        expect(icsSummary('')).toBe('');
        expect(icsSummary('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n')).toBe('');
    });

    it('reads the event, not the VTIMEZONE before it (Outlook, Google)', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'METHOD:REQUEST',
            'PRODID:Microsoft Exchange Server 2010',
            'BEGIN:VTIMEZONE',
            'TZID:W. Europe Standard Time',
            'BEGIN:STANDARD',
            'DTSTART:16010101T030000',
            'TZOFFSETTO:+0100',
            'END:STANDARD',
            'BEGIN:DAYLIGHT',
            'DTSTART:16010101T020000',
            'TZOFFSETTO:+0200',
            'END:DAYLIGHT',
            'END:VTIMEZONE',
            'BEGIN:VEVENT',
            'ORGANIZER;CN=Anna:mailto:anna@x.de',
            'ATTENDEE;CN=Peter:mailto:p@x.de',
            'SUMMARY:Projekt\\, Kickoff',
            'DTSTART;TZID=W. Europe Standard Time:20261022T100000',
            'DTEND;TZID=W. Europe Standard Time:20261022T110000',
            'LOCATION:Raum 3',
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            'DESCRIPTION:Reminder',
            'TRIGGER:-PT15M',
            'END:VALARM',
            'END:VEVENT',
            'END:VCALENDAR',
            '',
        ].join('\r\n');

        expect(icsSummary(ics)).toBe([
            '- Method: REQUEST',
            '- Organizer: anna@x.de',
            '- Title: Projekt, Kickoff',
            '- Start: 20261022T100000 (W. Europe Standard Time)',
            '- End: 20261022T110000 (W. Europe Standard Time)',
            '- Location: Raum 3',
            '- Attendees: 1',
        ].join('\n'));
    });

    it('unfolds lines and shows the TZID', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'METHOD:REQUEST',
            'BEGIN:VEVENT',
            'SUMMARY:Project kick',
            ' off meeting',
            'DTSTART;TZID=Europe/Berlin:20261021T090000',
            'LOCATION:Room 1\\, first floor',
            'ORGANIZER;CN=Alice:mailto:alice@example.org',
            'ATTENDEE;CN=Peter:mailto:peter@example.org',
            'ATTENDEE;CN=Bob:mailto:bob@example.org',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\n');

        expect(icsSummary(ics)).toBe([
            '- Method: REQUEST',
            '- Title: Project kickoff meeting',
            '- Start: 20261021T090000 (Europe/Berlin)',
            '- Location: Room 1, first floor',
            '- Organizer: alice@example.org',
            '- Attendees: 2',
        ].join('\n'));
    });
});

describe('addresses', () => {
    it('flattens groups', () => {
        expect(addresses(undefined)).toBe('');
        expect(addresses({ name: 'A', address: 'a@x.de' })).toBe('A <a@x.de>');
        expect(addresses([
            { name: 'Team', group: [{ name: 'B', address: 'b@x.de' }, { name: '', address: 'c@x.de' }] },
            { name: '', address: 'd@x.de' },
            { name: 'Empty', group: [] },
        ])).toBe('B <b@x.de>, c@x.de, d@x.de');
    });
});
