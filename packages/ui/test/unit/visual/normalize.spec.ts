/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { normalize } from '../../e2e/visual.ts';

const LOCALES = ['en-US', 'en-GB', 'de-DE'];

/** The 2nd of every month of a year, 08:00 UTC: one date per month spelling. */
const DATES = Array.from({ length: 12 }, (_, month) => new Date(Date.UTC(2026, month, 2, 8)));

/** The options `formatFireTime()` (`app/schedules/helpers.ts`) formats a schedule's next fire with. */
function formatFire(locale: string, date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
        timeZone,
    }).format(date);
}

describe('normalize() of the pins', () => {
    for (const locale of LOCALES) {
        it(`replaces a fire time of every month in ${locale}`, () => {
            for (const date of DATES) {
                for (const timeZone of ['Europe/Berlin', 'UTC']) {
                    const text = formatFire(locale, date, timeZone);

                    expect(normalize(text), text).toBe('<date>');
                    expect(normalize(`Next fire ${text} overlap`), text).toBe('Next fire <date> overlap');
                }
            }
        });

        it(`replaces a date and a time of every month in ${locale}`, () => {
            for (const date of DATES) {
                expect(normalize(date.toLocaleString(locale, { timeZone: 'UTC' }))).toBe('<date>');
                expect(normalize(date.toLocaleTimeString(locale, { timeZone: 'UTC' }))).toBe('<time>');
            }
        });
    }

    it('keeps text that only looks like a time span', () => {
        expect(normalize('weekdays 08:00 · Europe/Berlin')).toBe('weekdays <time> · Europe/Berlin');
        expect(normalize('Last 7 days')).toBe('Last 7 days');
        expect(normalize('polling · 5 s')).toBe('polling · 5 s');
    });
});
