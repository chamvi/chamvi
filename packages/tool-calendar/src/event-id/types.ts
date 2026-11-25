/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** What an event id names: one resource of a calendar at one version. */
export type CalendarEventRef = {
    account: string;
    /** The last path segment of the calendar URL. */
    slug: string;
    /** `<account>:<slug>`, as `calendar_list` gives it. */
    calendar: string;
    /** The resource's last path segment, as the server lists it. */
    name: string;
    /** The resource's ETag when it was read. */
    etag: string;
};
