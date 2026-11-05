/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ValidationError } from '@chamvi/core';
import { createDAVClient } from 'tsdav';
import type { DAVCalendar } from 'tsdav';
import { expandEvents } from '../expand/module.ts';
import type { CalendarEvent, CalendarRange } from '../expand/types.ts';
import { normalizeAccounts, normalizeClientOptions } from '../options/module.ts';
import type { CalendarClientOptions, CalendarClientOptionsNormalized } from '../options/types.ts';
import {
    calendarError,
    parseLimit,
    parseRange,
} from './asserts.ts';
import { guardedFetch } from './guard.ts';
import type {
    CalendarAccount,
    CalendarEventsInput,
    CalendarEventsResult,
    CalendarView,
    ICalendarClient,
} from './types.ts';

type DAVClient = Awaited<ReturnType<typeof createDAVClient>>;

type CalendarEntry = { view: CalendarView; dav: DAVCalendar };

type Session = {
    dav: DAVClient;
    /** The VEVENT calendars, listed once per session. */
    calendars?: Promise<CalendarEntry[]>;
};

type AccountState = {
    account: CalendarAccount;
    session?: Promise<Session>;
    /** The session while its login is still running. */
    login?: Promise<Session>;
};

function lastSegment(url: string): string {
    return new URL(url).pathname.split('/').filter((segment) => segment.length > 0).at(-1) ?? '';
}

function timezoneOf(vtimezone: string | undefined): string | undefined {
    return vtimezone ? /^TZID:(.+)$/m.exec(vtimezone)?.[1]?.trim() || undefined : undefined;
}

function viewOf(account: CalendarAccount, calendar: DAVCalendar): CalendarView {
    const slug = lastSegment(calendar.url);
    const { displayName, calendarColor } = calendar;
    const timezone = timezoneOf(calendar.timezone);

    return {
        calendar: `${account.id}:${slug}`,
        account: account.id,
        name: typeof displayName === 'string' && displayName.length > 0 ? displayName : slug,
        ...(typeof calendarColor === 'string' && calendarColor.length > 0 && { color: calendarColor }),
        ...(timezone && { timezone }),
    };
}

/** The start of `event` as epoch milliseconds (an all-day event at midnight in `zone`). */
function startOf(event: CalendarEvent, zone: string): number {
    if (event.allDay) {
        return Temporal.PlainDate.from(event.start).toZonedDateTime(zone).epochMilliseconds;
    }

    return Temporal.Instant.from(event.start).epochMilliseconds;
}

class CalendarClient implements ICalendarClient {
    protected options: CalendarClientOptionsNormalized;

    protected states: Map<string, AccountState>;

    protected fetch: typeof fetch;

    constructor(accounts: CalendarAccount[], options: CalendarClientOptionsNormalized) {
        this.options = options;
        this.fetch = guardedFetch(options.fetch);
        this.states = new Map(accounts.map((account) => [account.id, { account }]));
    }

    async calendars(options: { signal?: AbortSignal } = {}): Promise<CalendarView[]> {
        const lists = await Promise.all(this.states.values().toArray().map((state) => this.request(
            'calendar_list',
            state,
            options.signal,
            async (signal) => (await this.calendarsOf(state, signal)).map((entry) => entry.view),
        )));

        return lists.flat();
    }

    async events(input: CalendarEventsInput): Promise<CalendarEventsResult> {
        const { timezone } = this.options;
        const range = parseRange(input.from, input.to, timezone);
        const limit = parseLimit(input.limit);
        let states = this.states.values().toArray();

        if (input.calendar !== undefined) {
            const state = typeof input.calendar === 'string' ? this.states.get(input.calendar.split(':')[0] ?? '') : undefined;

            if (!state) {
                throw new ValidationError('calendar is unknown: take one from calendar_list.');
            }

            states = [state];
        }

        const lists = await Promise.all(states.map((state) => this.request(
            'calendar_events',
            state,
            input.signal,
            (signal) => this.eventsOf(state, range, input.calendar, signal),
        )));
        const events = lists.flat()
            .map((event) => ({ event, start: startOf(event, timezone) }))
            .sort((a, b) => a.start - b.start || Number(b.event.allDay) - Number(a.event.allDay) || a.event.uid.localeCompare(b.event.uid))
            .map(({ event }) => event);

        return { events: events.slice(0, limit), truncated: events.length > limit };
    }

    async close(): Promise<void> {
        for (const state of this.states.values()) {
            state.session = undefined;
        }
    }

    // ----------------------------------------------------------------

    protected async eventsOf(
        state: AccountState,
        range: CalendarRange,
        calendar: string | undefined,
        signal: AbortSignal,
    ): Promise<CalendarEvent[]> {
        let entries = await this.calendarsOf(state, signal);

        if (calendar !== undefined) {
            entries = entries.filter((entry) => entry.view.calendar === calendar);

            if (entries.length === 0) {
                throw new ValidationError('calendar is unknown: take one from calendar_list.');
            }
        }

        const session = await this.sessionOf(state, signal);
        const events: CalendarEvent[] = [];

        for (const entry of entries) {
            const objects = await session.dav.fetchCalendarObjects({
                calendar: entry.dav,
                timeRange: {
                    start: new Date(range.from.epochMilliseconds).toISOString(),
                    end: new Date(range.to.epochMilliseconds).toISOString(),
                },
                // the server's time-range filter is coarse and its expansion unreliable: expand here
                useMultiGet: false,
                fetchOptions: { signal },
            });

            for (const object of objects) {
                if (typeof object.data !== 'string') {
                    continue;
                }

                try {
                    events.push(...expandEvents(object.data, range, this.options.timezone, {
                        calendar: entry.view.calendar,
                        user: state.account.user,
                    }));
                } catch {
                    // a resource that is not iCalendar holds no event to show
                }
            }
        }

        return events;
    }

    protected calendarsOf(state: AccountState, signal: AbortSignal): Promise<CalendarEntry[]> {
        return this.sessionOf(state, signal).then((session) => {
            session.calendars ??= session.dav.fetchCalendars({ fetchOptions: { signal } }).then(
                (calendars) => calendars
                    .filter((calendar) => calendar.components?.includes('VEVENT'))
                    .map((calendar) => ({ view: viewOf(state.account, calendar), dav: calendar })),
                (error: unknown) => {
                    session.calendars = undefined;

                    throw error;
                },
            );

            return session.calendars;
        });
    }

    /** The account's logged-in session, created on first use (a failed login is retried by the next call). */
    protected sessionOf(state: AccountState, signal: AbortSignal): Promise<Session> {
        if (!state.session) {
            const { account } = state;
            const session = createDAVClient({
                serverUrl: account.url,
                credentials: { username: account.user, password: account.password },
                authMethod: 'Basic',
                defaultAccountType: 'caldav',
                fetch: this.fetch,
                fetchOptions: { signal },
            }).then((dav): Session => ({ dav }));

            state.session = session;
            state.login = session;
            session.then(() => {
                if (state.login === session) {
                    state.login = undefined;
                }
            }, () => {
                if (!(state.session === session)) {
                    return;
                }

                state.session = undefined;
                state.login = undefined;
            });
        }

        return state.session;
    }

    /**
     * Runs `run` for one account within the timeout (on the clock). Failures
     * become `calendar_request` errors with a generic message: tsdav's own
     * messages can carry URLs and server text, so they are dropped.
     */
    protected async request<T>(
        tool: string,
        state: AccountState,
        outer: AbortSignal | undefined,
        run: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> {
        const controller = new AbortController();
        const signal = outer ? AbortSignal.any([outer, controller.signal]) : controller.signal;
        const timeout = new Promise<never>((_resolve, reject) => {
            controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
        });
        const timer = this.options.clock.setTimeout(() => {
            controller.abort(calendarError(`${tool}: ${state.account.id}: timed out`));
        }, this.options.timeoutMs);

        try {
            return await Promise.race([run(signal), timeout]);
        } catch (error) {
            // a login cut by the timeout or a cancel must not be reused by the next call
            if ((controller.signal.aborted || outer?.aborted) && state.login) {
                state.session = undefined;
                state.login = undefined;
            }

            if (controller.signal.aborted) {
                throw controller.signal.reason;
            }

            if (outer?.aborted) {
                throw outer.reason;
            }

            if (error instanceof ChamviError) {
                throw error;
            }

            throw calendarError(`${tool}: ${state.account.id}: request failed`);
        } finally {
            timer.clear();
        }
    }
}

/**
 * A read-only CalDAV client over `accounts` (checked here,
 * InvalidAgentDefinitionError). Each account logs in on first use; requests
 * other than PROPFIND, REPORT and GET are refused before they are sent.
 */
export function createCalendarClient(accounts: CalendarAccount[], options: CalendarClientOptions = {}): ICalendarClient {
    return new CalendarClient(normalizeAccounts(accounts), normalizeClientOptions(options));
}
