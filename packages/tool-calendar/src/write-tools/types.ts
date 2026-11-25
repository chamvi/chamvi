/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock, ModelRef, ToolContext } from '@chamvi/core';
import type { CalendarAccount } from '../client/types.ts';
import type { CalendarClientOptions } from '../options/types.ts';
import type { CalendarTime, ICalendarWriteClient } from '../write-client/types.ts';

/** The settings of a write tool's own limit, each with its default. */
export type CalendarLimitSettings = {
    /** The most calls per window. */
    max?: number;
    /** The window in milliseconds. */
    windowMs?: number;
    /** The bucket the calls count in. */
    bucket?: string;
};

export type CalendarWriteToolsOptions = CalendarClientOptions & {
    /** The accounts the tools write through a client of their own. */
    accounts?: CalendarAccount[];
    /** A client to use instead of one built from `accounts`. */
    client?: ICalendarWriteClient;
    /** The model that decides whether a delete is routine; default the agent's model. */
    classifier?: { model?: ModelRef };
    /** `calendar_create`'s own limit (default 20 events an hour in bucket `creates`); false: none. */
    createLimit?: CalendarLimitSettings | false;
    /**
     * `calendar_delete`'s own limit (default 20 an hour in bucket `deletes`, shared with `mail_delete`: when an
     * agent has both, `deleteLimit` of `mailWriteTools()` and `calendarWriteTools()` must be equal); false: none.
     */
    deleteLimit?: CalendarLimitSettings | false;
    /**
     * The calendar ids (`<account>:<slug>`) the tools may write to; default every listed calendar. A create or
     * delete elsewhere is a ValidationError before any request.
     */
    calendars?: string[];
};

/** The input of `calendar_create`. */
export type CalendarCreateInput = {
    /** A calendar id of `calendar_list`. */
    calendar: string;
    title: string;
    /** An ISO date-time (without an offset: the configured zone); with `allDay` a date. */
    start: string;
    /** As `start`; exclusive. */
    end: string;
    allDay?: boolean;
    location?: string;
    description?: string;
    /** Bare addresses to invite. */
    attendees?: string[];
};

/** The input of `calendar_delete`. */
export type CalendarDeleteInput = {
    /** An event id of `calendar_events`. */
    event: string;
    /** Required for a repeating event: deletes every occurrence. */
    series?: boolean;
};

/** A `calendar_create` input checked (internal). */
export type ParsedCreate = {
    calendar: string;
    title: string;
    allDay: boolean;
    start: CalendarTime;
    end: CalendarTime;
    location?: string;
    description?: string;
    /** Deduplicated case-insensitively, in input order. */
    attendees: string[];
};

/** The write client a tool call uses: the given one, or the one provided on the engine. */
export type CalendarWriteClientSource = (ctx: ToolContext) => ICalendarWriteClient;

/** Whether the tools may write to the calendar id (internal). */
export type CalendarWritable = (calendar: string) => boolean;

/** What `calendar_create` takes besides its client (internal). */
export type CalendarCreateToolOptions = {
    limit?: CalendarLimitSettings | false;
    writable: CalendarWritable;
};

/** The result of `calendar_delete`. */
export type CalendarDeleteResult = {
    event: string;
    calendar: string;
    /** `missing`: the event was gone already. */
    status: 'deleted' | 'missing';
    /** The artifact id of the event's iCalendar, saved before the delete. */
    backup?: string;
};

/** What a delete's limit approval listed (internal): the event its listing covered and the listing itself. */
export type CalendarDeleteShown = {
    event: string;
    text: string;
};

/** What `calendar_delete` takes besides its client (internal). */
export type CalendarDeleteToolOptions = CalendarClassifierOptions & {
    limit?: CalendarLimitSettings | false;
    writable: CalendarWritable;
};

/** What the classifier of `calendar_delete` runs on (internal). */
export type CalendarClassifierOptions = {
    clock: IClock;
    timeoutMs: number;
    model?: ModelRef;
};
