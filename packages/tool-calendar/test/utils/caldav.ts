/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The server URL an account uses against the fake (iCloud-shaped). */
export const FAKE_CALDAV_URL = 'https://caldav.icloud.com';

const PARTITION = 'https://p42-caldav.icloud.com';
const HOME = '/123/calendars/';

export type FakeCalendar = {
    /** The last path segment of the calendar URL. */
    slug: string;
    name: string;
    color?: string;
    /** `supported-calendar-component-set`; default `['VEVENT']`. */
    components?: string[];
    /** A VTIMEZONE text as `calendar-timezone`. */
    timezone?: string;
    /** ICS resources of the calendar; every REPORT returns all of them. */
    objects: string[];
};

export type FakeRequest = {
    method: string;
    url: string;
    depth: string | null;
    authorization: string | null;
    body: string;
};

export type FakeCalDav = {
    /** A fetch answering like iCloud's CalDAV; pass it as the client's `fetch`. */
    fetch: typeof fetch;
    requests: FakeRequest[];
    calendars: FakeCalendar[];
    /** Answer every request with this status (401: wrong credentials). */
    status?: number;
    /** Never answer until the request's signal aborts. */
    hang: boolean;
};

function multistatus(body: string): string {
    return '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" ' +
        `xmlns:ic="http://apple.com/ns/ical/" xmlns:cs="http://calendarserver.org/ns/">${body}</d:multistatus>`;
}

function xml(body: string): Response {
    return new Response(multistatus(body), { status: 207, headers: { 'content-type': 'application/xml; charset=utf-8' } });
}

function ok(href: string, props: string): string {
    return `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop>` +
        '<d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>';
}

function escapeXml(text: string): string {
    return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function calendarProps(calendar: FakeCalendar): string {
    const components = (calendar.components ?? ['VEVENT']).map((name) => `<c:comp name="${name}"/>`).join('');

    return [
        `<d:displayname>${escapeXml(calendar.name)}</d:displayname>`,
        calendar.color ? `<ic:calendar-color>${calendar.color}</ic:calendar-color>` : '',
        calendar.timezone ? `<c:calendar-timezone>${escapeXml(calendar.timezone)}</c:calendar-timezone>` : '',
        '<d:resourcetype><d:collection/><c:calendar/></d:resourcetype>',
        `<c:supported-calendar-component-set>${components}</c:supported-calendar-component-set>`,
    ].join('');
}

function hang(signal: AbortSignal | null | undefined): Promise<Response> {
    return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
}

/**
 * An in-process CalDAV server behind a fetch: the iCloud discovery
 * (`.well-known` redirect to a partition host, principal, absolute home with
 * `:443`), calendars, `supported-report-set` and `calendar-query` REPORTs.
 * Records every request; anything unknown answers 404.
 */
export function createFakeCalDav(calendars: FakeCalendar[] = []): FakeCalDav {
    const requests: FakeRequest[] = [];
    const fake: FakeCalDav = {
        requests,
        calendars,
        hang: false,
        fetch: async (input, init) => {
            const url = new URL(input instanceof Request ? input.url : String(input));
            const method = (init?.method ?? 'GET').toUpperCase();
            const headers = new Headers(init?.headers);

            requests.push({
                method,
                url: url.href,
                depth: headers.get('depth'),
                authorization: headers.get('authorization'),
                body: typeof init?.body === 'string' ? init.body : '',
            });

            init?.signal?.throwIfAborted();

            if (fake.hang) {
                return hang(init?.signal);
            }

            if (fake.status !== undefined) {
                return new Response('<error>denied for this user</error>', { status: fake.status, statusText: 'Unauthorized' });
            }

            const path = url.pathname;

            if (path === '/.well-known/caldav' || (url.origin === FAKE_CALDAV_URL && path === '/')) {
                return new Response(null, { status: 301, headers: { location: `${PARTITION}/` } });
            }

            if (url.origin !== PARTITION) {
                return new Response('not found', { status: 404 });
            }

            if (path === '/' && method === 'PROPFIND') {
                return xml(ok('/', '<d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal>'));
            }

            if (path === '/123/principal/' && method === 'PROPFIND') {
                return xml(ok('/123/principal/', `<c:calendar-home-set><d:href xmlns:d="DAV:">${PARTITION}:443${HOME}</d:href></c:calendar-home-set>`));
            }

            if (path === HOME && method === 'PROPFIND') {
                return xml(ok(HOME, '<d:resourcetype><d:collection/></d:resourcetype>') +
                    ok(`${HOME}inbox/`, '<d:resourcetype><d:collection/><c:schedule-inbox/></d:resourcetype>') +
                    calendars.map((calendar) => ok(`${HOME}${calendar.slug}/`, calendarProps(calendar))).join(''));
            }

            const calendar = calendars.find((item) => path === `${HOME}${item.slug}/`);

            if (calendar && method === 'PROPFIND') {
                return xml(ok(path, '<d:supported-report-set><d:supported-report><d:report><c:calendar-query/></d:report></d:supported-report></d:supported-report-set>'));
            }

            if (calendar && method === 'REPORT') {
                return xml(calendar.objects.map((ics, index) => ok(
                    `${path}event-${index}.ics`,
                    `<d:getetag>"${index}"</d:getetag><c:calendar-data>${escapeXml(ics)}</c:calendar-data>`,
                )).join(''));
            }

            return new Response('not found', { status: 404 });
        },
    };

    return fake;
}
