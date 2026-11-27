/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ValidationError } from '@chamvi/errors';
import { isObject } from 'smob';
import { DAVClient } from 'tsdav';
import type { DAVCalendar } from 'tsdav';
import { calendarError } from '../client/asserts.ts';
import type { CalendarAccount } from '../client/types.ts';
import type { CalendarClientOptionsNormalized } from '../options/types.ts';
import { CALENDAR_UNKNOWN_MESSAGE } from './constants.ts';
import { writeGuardedFetch } from './guard.ts';
import type { CalendarWriteEntry, CalendarWriteView } from './types.ts';

type Session = {
    dav: DAVClient;
    /** The VEVENT calendars, listed once per session. */
    calendars?: Promise<CalendarWriteEntry[]>;
    /** The principal's calendar user addresses, read once per session (`[]` on failure). */
    addresses?: Promise<string[]>;
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

function viewOf(account: CalendarAccount, calendar: DAVCalendar): CalendarWriteView {
    const slug = lastSegment(calendar.url);
    const { displayName } = calendar;

    return {
        calendar: `${account.id}:${slug}`,
        account: account.id,
        name: typeof displayName === 'string' && displayName.length > 0 ? displayName : slug,
        url: new URL(calendar.url).href,
    };
}

// what a calendar's own sharing read asks for
const SHARING_PROPS = { 'd:resourcetype': {}, 'd:owner': {} };

function hrefOf(value: unknown): string | undefined {
    if (typeof value === 'string' && value.length > 0) {
        return value;
    }

    return isObject(value) && typeof value.href === 'string' && value.href.length > 0 ? value.href : undefined;
}

/** `href` resolved against `base`, its path with a trailing slash: one principal however the server spells it. */
function principalOf(href: string, base: string): string {
    const url = new URL(href, base);
    const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;

    return `${url.origin}${path}`;
}

/**
 * Whether someone else shares the calendar at `url` with the account: CalendarServer's `shared` resource type
 * (not `shared-owner`, the owner's own view), or a `DAV:owner` that is not the account's principal (origin and
 * path, both resolved against the calendar URL) when both are known. A server that reports neither counts as the
 * account's own.
 */
function sharedOf(resourcetype: string[], owner: unknown, principal: string | undefined, url: string): boolean {
    if (resourcetype.includes('shared')) {
        return true;
    }

    const href = hrefOf(owner);

    if (!href || !principal) {
        return false;
    }

    try {
        return principalOf(href, url) !== principalOf(principal, url);
    } catch {
        // an owner that is no URL is not the account's principal
        return true;
    }
}

/**
 * The write client's tsdav sessions, one per account, separate from the read
 * client's: login and discovery (PROPFIND) through the write guard, each call
 * raced against the timeout on the clock and the caller's signal.
 */
export class CalendarWriteSessions {
    readonly options: CalendarClientOptionsNormalized;

    /** The given fetch behind the write guard; every request of the write client goes through it. */
    readonly fetch: typeof fetch;

    protected states: Map<string, AccountState>;

    constructor(accounts: CalendarAccount[], options: CalendarClientOptionsNormalized) {
        this.options = options;
        this.fetch = writeGuardedFetch(options.fetch);
        this.states = new Map(accounts.map((account) => [account.id, { account }]));
    }

    /** The account `id`; a ValidationError (`CALENDAR_UNKNOWN_MESSAGE`) for an unknown one. */
    account(id: string): CalendarAccount {
        const state = this.states.get(id);

        if (!state) {
            throw new ValidationError(CALENDAR_UNKNOWN_MESSAGE);
        }

        return state.account;
    }

    /** The listed VEVENT calendars of `account`, once per session. Call inside `run`. */
    calendars(account: string, signal: AbortSignal): Promise<CalendarWriteEntry[]> {
        const state = this.stateOf(account);

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

    /** The listed VEVENT calendar `id` of `account`; a ValidationError for any other. Call inside `run`. */
    async calendar(account: string, id: string, signal: AbortSignal): Promise<CalendarWriteEntry> {
        const entry = (await this.calendars(account, signal)).find((item) => item.view.calendar === id);

        if (!entry) {
            throw new ValidationError(CALENDAR_UNKNOWN_MESSAGE);
        }

        return entry;
    }

    /**
     * The principal's calendar user addresses of `account`, once per session; a
     * failed read gives `[]` (a cut one is read again). Call inside `run`.
     */
    addresses(account: string, signal: AbortSignal): Promise<string[]> {
        const state = this.stateOf(account);

        return this.sessionOf(state, signal).then((session) => {
            if (!session.addresses) {
                const { dav } = session;
                const addresses = dav.account ?
                    dav.fetchCalendarUserAddresses({ account: dav.account, fetchOptions: { signal } }) :
                    Promise.resolve([]);

                session.addresses = addresses.catch((error: unknown) => {
                    if (signal.aborted) {
                        session.addresses = undefined;

                        throw error;
                    }

                    return [];
                });
            }

            return session.addresses;
        });
    }

    /**
     * Whether the calendar of `entry` is shared with `account` by someone else, read now (one PROPFIND, Depth 0,
     * of its resourcetype and owner; never the discovery's cached answer). A failed read counts as shared.
     * Call inside `run`.
     */
    async shared(account: string, entry: CalendarWriteEntry, signal: AbortSignal): Promise<boolean> {
        const session = await this.sessionOf(this.stateOf(account), signal);

        try {
            const responses = await session.dav.propfind({
                url: entry.view.url,
                props: SHARING_PROPS,
                depth: '0',
                fetchOptions: { signal },
            });
            const found = responses.find((response) => response.ok && isObject(response.props));

            if (!found) {
                return true;
            }

            const props = found.props as Record<string, unknown>;
            const resourcetype = isObject(props.resourcetype) ? Object.keys(props.resourcetype) : [];

            return sharedOf(resourcetype, props.owner, session.dav.account?.principalUrl, entry.view.url);
        } catch {
            signal.throwIfAborted();

            return true;
        }
    }

    /**
     * Runs `fn` for `account` within the timeout (on the clock) and the caller's
     * signal. A failure that is not a ChamviError becomes `<tool>: <account>:
     * request failed`, the timeout `timed out`: tsdav's own messages can carry
     * URLs and server text, so they are dropped.
     */
    async run<T>(tool: string, account: string, outer: AbortSignal | undefined, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
        const state = this.stateOf(account);
        const controller = new AbortController();
        const signal = outer ? AbortSignal.any([outer, controller.signal]) : controller.signal;
        const timeout = new Promise<never>((_resolve, reject) => {
            controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
        });
        const timer = this.options.clock.setTimeout(() => {
            controller.abort(calendarError(`${tool}: ${state.account.id}: timed out`));
        }, this.options.timeoutMs);

        timer.unref?.();

        try {
            outer?.throwIfAborted();

            return await Promise.race([fn(signal), timeout]);
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

    /** Forgets every session; the next call logs in again. */
    close(): void {
        for (const state of this.states.values()) {
            state.session = undefined;
            state.login = undefined;
        }
    }

    // ----------------------------------------------------------------

    protected stateOf(account: string): AccountState {
        const state = this.states.get(account);

        if (!state) {
            throw new ValidationError(CALENDAR_UNKNOWN_MESSAGE);
        }

        return state;
    }

    /** The account's logged-in session, created on first use (a failed login is retried by the next call). */
    protected sessionOf(state: AccountState, signal: AbortSignal): Promise<Session> {
        if (!state.session) {
            const { account } = state;
            const dav = new DAVClient({
                serverUrl: account.url,
                credentials: { username: account.user, password: account.password },
                authMethod: 'Basic',
                defaultAccountType: 'caldav',
                fetch: this.fetch,
                fetchOptions: { signal },
            });
            const session = dav.login().then((): Session => ({ dav }));

            state.session = session;
            state.login = session;
            session.then(() => {
                if (state.login === session) {
                    state.login = undefined;
                }
            }, () => {
                if (state.session !== session) {
                    return;
                }

                state.session = undefined;
                state.login = undefined;
            });
        }

        return state.session;
    }
}
