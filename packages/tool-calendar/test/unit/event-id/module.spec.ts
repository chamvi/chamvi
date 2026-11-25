/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@chamvi/core';
import { CALENDAR_EVENT_ID_MESSAGE } from '../../../src/event-id/constants.ts';
import { encodeCalendarEventId, parseCalendarEventId } from '../../../src/event-id/module.ts';

function b64(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64url');
}

function refusal(id: unknown): unknown {
    try {
        parseCalendarEventId(id);
    } catch (error) {
        return error;
    }

    return undefined;
}

describe('calendar event ids', () => {
    it('round-trips a calendar, resource name and etag', () => {
        const id = encodeCalendarEventId({
            calendar: 'icloud:home', 
            name: 'event-0.ics', 
            etag: '"0"', 
        });

        expect(id).toBe(`icloud:home:${b64('event-0.ics')}:${b64('"0"')}`);
        expect(parseCalendarEventId(id)).toEqual({
            account: 'icloud',
            slug: 'home',
            calendar: 'icloud:home',
            name: 'event-0.ics',
            etag: '"0"',
        });
    });

    it('round-trips a slug with colons and a percent-encoded name', () => {
        const ref = {
            calendar: 'work:a:b', 
            name: 'my%20event.ics', 
            etag: 'W/"abc"', 
        };

        expect(parseCalendarEventId(encodeCalendarEventId(ref))).toEqual({
            ...ref,
            account: 'work',
            slug: 'a:b',
        });
    });

    it('refuses anything encode would not give back', () => {
        const name = b64('event-0.ics');
        const etag = b64('"0"');

        for (const id of [
            '',
            'icloud:home',
            `icloud:home:${name}`,
            `:home:${name}:${etag}`,
            `icloud::${name}:${etag}`,
            `icloud:home::${etag}`,
            `icloud:home:${name}:`,
            `icloud:home:${name}:not*base64`,
            // padding and the standard alphabet are not canonical base64url
            `icloud:home:${b64('>>>.ics').replaceAll('-', '+')}:${etag}`,
            `icloud:home:${Buffer.from('ab').toString('base64')}:${etag}`,
            `icloud:home:${b64('a/b.ics')}:${etag}`,
            `icloud:home:${name}:${b64('x'.repeat(256))}`,
            `icloud:home:${b64('x'.repeat(256))}:${etag}`,
            // encoded path tricks a decoding server would map outside the calendar
            `icloud:home:${b64('..%2Fwork%2Fx.ics')}:${etag}`,
            `icloud:home:${b64('%2E%2E%2Fx.ics')}:${etag}`,
            `icloud:home:${b64('a%5Cb.ics')}:${etag}`,
            `icloud:home:${b64('%2fx.ics')}:${etag}`,
            `icloud:home:${b64('%E0%A4%A.ics')}:${etag}`,
            `icloud:home:${b64('a%0Ab.ics')}:${etag}`,
            `icloud:home:${b64('..')}:${etag}`,
            // wildcard, list or header-breaking versions
            `icloud:home:${name}:${b64('*')}`,
            `icloud:home:${name}:${b64('"a", "b"')}`,
            `icloud:home:${name}:${b64('"a"\r\nX-Evil: 1')}`,
            `icloud:home:${name}:${b64('"a\0"')}`,
            42,
            undefined,
            { calendar: 'icloud:home' },
        ]) {
            const error = refusal(id);

            expect(error, String(id)).toBeInstanceOf(ValidationError);
            expect((error as Error).message).toBe(CALENDAR_EVENT_ID_MESSAGE);
        }

        expect(CALENDAR_EVENT_ID_MESSAGE).toBe('event must be an id from calendar_events.');
    });

    it('accepts a name and etag of 255 characters', () => {
        const ref = {
            calendar: 'icloud:home', 
            name: 'x'.repeat(255), 
            etag: 'y'.repeat(255), 
        };

        expect(parseCalendarEventId(encodeCalendarEventId(ref)).name).toBe(ref.name);
    });
});
