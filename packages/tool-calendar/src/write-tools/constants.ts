/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The most attendees one `calendar_create` invites. */
export const CALENDAR_CREATE_MAX_ATTENDEES = 50;

/** The longest event `calendar_create` takes, in days from start to end. */
export const CALENDAR_CREATE_MAX_DAYS = 366;

/** The default `max` of `calendar_create`'s own limit: at most this many events created per window. */
export const CALENDAR_CREATE_LIMIT_MAX = 20;

/** The default window of `calendar_create`'s own limit: one hour. */
export const CALENDAR_CREATE_LIMIT_WINDOW_MS = 3_600_000;

/** The default bucket of `calendar_create`'s own limit. */
export const CALENDAR_CREATE_LIMIT_BUCKET = 'creates';

/**
 * The default `max` of `calendar_delete`'s own limit. Equal to tool-mail's
 * `MAIL_DELETE_LIMIT_MAX`: both default to the bucket `deletes`, and core
 * refuses tools sharing a bucket with another `max` or `windowMs`.
 */
export const CALENDAR_DELETE_LIMIT_MAX = 20;

/** The default window of `calendar_delete`'s own limit: one hour (equal to tool-mail's). */
export const CALENDAR_DELETE_LIMIT_WINDOW_MS = 3_600_000;

/** The default bucket of `calendar_delete`'s own limit, shared with `mail_delete`. */
export const CALENDAR_DELETE_LIMIT_BUCKET = 'deletes';

/** Where an approval cuts a field it shows from untrusted text (internal). */
export const CALENDAR_APPROVAL_FIELD_MAX_CHARS = 200;

/** The line of a create approval between the fields and the description (internal): the text cannot pose as a field. */
export const CALENDAR_DESCRIPTION_SEPARATOR = '--- description ---';

/** The once() name under which a create records whether its limit approval showed the whole call (internal). */
export const CALENDAR_CREATE_SHOWN_ONCE = 'calendar_create:limit-shown';
