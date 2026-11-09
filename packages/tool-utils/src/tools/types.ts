/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** An instant read in a zone. */
export type ZonedDescription = {
    date: string;
    weekday: string;
    time: string;
    timezone: string;
    offset: string;
    iso: string;
};

export type CurrentTimeResult = ZonedDescription & {
    /** The run's intake time in the same zone. */
    startTime: string;
};

export type TimeConvertResult = {
    from: ZonedDescription;
    to: ZonedDescription;
};

/** Whole calendar units, each a separate signed total. */
export type DateDiffResult = {
    days: number;
    weeks: number;
    months: number;
    years: number;
};

export type DateInfoResult = {
    date: string;
    weekday: string;
    isoWeek: number;
    isoWeekYear: number;
    dayOfYear: number;
    daysInMonth: number;
    leapYear: boolean;
};

export type NextWeekdayResult = {
    date: string;
    weekday: string;
    daysAway: number;
};

export type ParsedDate = {
    zoned: Temporal.ZonedDateTime;
    /** The input was `YYYY-MM-DD`. */
    dateOnly: boolean;
    /** The input carried an offset or `Z`. */
    hasOffset: boolean;
};
