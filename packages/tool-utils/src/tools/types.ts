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
