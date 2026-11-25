/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import { ValidationError } from '@chamvi/core';
import type { CalendarAccount } from '../client/types.ts';
import { normalizeAccounts, normalizeClientOptions } from '../options/module.ts';
import type { CalendarClientOptions, CalendarClientOptionsNormalized } from '../options/types.ts';
import { calendarAccountOf, organizerOf } from './asserts.ts';
import { CALENDAR_UNKNOWN_MESSAGE } from './constants.ts';
import { createCalendarEvent, findCreatedEvent } from './create.ts';
import { describeCalendarEvent } from './describe.ts';
import { removeCalendarEvent } from './remove.ts';
import { CalendarWriteSessions } from './session.ts';
import type {
    CalendarCreateRequest,
    CalendarCreateResult,
    CalendarDeleteItem,
    CalendarWriteView,
    ICalendarWriteClient,
} from './types.ts';

/** The tool a lookup's failure names: the create looks up calendars and organizers. */
const LOOKUP_TOOL = 'calendar_create';

/** Creates and deletes events; its own tsdav sessions and guarded fetch, separate from the read client. */
class CalendarWriteClient implements ICalendarWriteClient {
    readonly timezone: string;

    readonly clock: IClock;

    protected sessions: CalendarWriteSessions;

    constructor(accounts: CalendarAccount[], options: CalendarClientOptionsNormalized) {
        this.timezone = options.timezone;
        this.clock = options.clock;
        this.sessions = new CalendarWriteSessions(accounts, options);
    }

    async calendar(id: string, signal?: AbortSignal): Promise<CalendarWriteView> {
        const account = typeof id === 'string' ? calendarAccountOf(id) : '';

        if (account.length === 0) {
            throw new ValidationError(CALENDAR_UNKNOWN_MESSAGE);
        }

        this.sessions.account(account);

        const entry = await this.sessions.run(LOOKUP_TOOL, account, signal, (inner) => this.sessions.calendar(account, id, inner));

        return { ...entry.view };
    }

    async organizer(account: string, signal?: AbortSignal): Promise<string | undefined> {
        const { user } = this.sessions.account(account);
        const addresses = await this.sessions.run(LOOKUP_TOOL, account, signal, (inner) => this.sessions.addresses(account, inner));

        return organizerOf(addresses, user);
    }

    async create(request: CalendarCreateRequest, signal?: AbortSignal): Promise<CalendarCreateResult> {
        return createCalendarEvent(this.sessions, request, signal);
    }

    async findCreated(calendar: string, key: string, signal?: AbortSignal): Promise<CalendarCreateResult | undefined> {
        return findCreatedEvent(this.sessions, calendar, key, signal);
    }

    async describe(event: string, signal?: AbortSignal): Promise<CalendarDeleteItem | undefined> {
        return describeCalendarEvent(this.sessions, event, signal);
    }

    async remove(event: string, signal?: AbortSignal): Promise<'deleted' | 'missing'> {
        return removeCalendarEvent(this.sessions, event, signal);
    }

    async close(): Promise<void> {
        this.sessions.close();
    }
}

/**
 * A CalDAV client that creates and deletes events of `accounts` (checked
 * here, InvalidAgentDefinitionError), with the options of
 * `createCalendarClient()`. Each account logs in on first use; only PROPFIND,
 * GET, PUT with `If-None-Match: *` and DELETE with `If-Match` are sent.
 */
export function createCalendarWriteClient(accounts: CalendarAccount[], options: CalendarClientOptions = {}): ICalendarWriteClient {
    return new CalendarWriteClient(normalizeAccounts(accounts), normalizeClientOptions(options));
}
