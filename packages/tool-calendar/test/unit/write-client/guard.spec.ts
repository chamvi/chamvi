/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ChamviError } from '@chamvi/core';
import { CALENDAR_REQUEST_ERROR_CODE, CALENDAR_WRITE_ALLOWED_METHODS } from '@chamvi/tool-calendar';
import { writeGuardedFetch } from '../../../src/write-client/guard.ts';

const URL_OF_EVENT = 'https://p42-caldav.icloud.com/123/calendars/home/event-0.ics';

function recording() {
    const seen: { input: unknown; init: RequestInit | undefined }[] = [];
    const inner: typeof fetch = async (input, init) => {
        seen.push({ input, init });

        return new Response('');
    };

    return { seen, fetch: writeGuardedFetch(inner) };
}

async function rejection(promise: Promise<unknown>): Promise<ChamviError> {
    const error = await promise.then(() => undefined, (e: unknown) => e);

    expect(error).toBeInstanceOf(ChamviError);
    expect((error as ChamviError).code).toBe(CALENDAR_REQUEST_ERROR_CODE);

    return error as ChamviError;
}

describe('writeGuardedFetch', () => {
    it('allows PROPFIND, GET, PUT and DELETE only', () => {
        expect(CALENDAR_WRITE_ALLOWED_METHODS).toEqual(['PROPFIND', 'GET', 'PUT', 'DELETE']);
    });

    it('passes PROPFIND and GET', async () => {
        const { seen, fetch } = recording();

        await fetch(URL_OF_EVENT, { method: 'propfind' });
        await fetch(URL_OF_EVENT);
        await fetch(new URL(URL_OF_EVENT), { method: 'GET' });

        expect(seen).toHaveLength(3);
    });

    it('passes a PUT with If-None-Match: * and forces redirect: manual', async () => {
        const { seen, fetch } = recording();

        await fetch(URL_OF_EVENT, {
            method: 'PUT',
            headers: { 'If-None-Match': '*' },
            body: 'BEGIN:VCALENDAR',
            redirect: 'follow',
        });

        expect(seen).toHaveLength(1);
        expect(seen[0]?.init?.redirect).toBe('manual');
        expect(seen[0]?.init?.method).toBe('PUT');
    });

    it('passes a DELETE with If-Match and forces redirect: manual', async () => {
        const { seen, fetch } = recording();

        await fetch(URL_OF_EVENT, { method: 'DELETE', headers: new Headers({ 'if-match': '"0"' }) });

        expect(seen).toHaveLength(1);
        expect(seen[0]?.init?.redirect).toBe('manual');
    });

    it('refuses every other request before sending it', async () => {
        const { seen, fetch } = recording();

        const refused: RequestInit[] = [
            { method: 'PUT' },
            { method: 'PUT', headers: { 'If-None-Match': 'W/"1"' } },
            { method: 'PUT', headers: { 'If-None-Match': '*', 'If-Match': '"0"' } },
            { method: 'PUT', headers: { 'If-Match': '"0"' } },
            { method: 'DELETE' },
            { method: 'DELETE', headers: { 'If-Match': '' } },
            { method: 'DELETE', headers: { 'If-None-Match': '*' } },
            { method: 'DELETE', headers: { 'If-Match': '*' } },
            { method: 'DELETE', headers: { 'If-Match': ' * ' } },
            { method: 'DELETE', headers: { 'If-Match': '"a", "b"' } },
        ];

        for (const init of refused) {
            await rejection(fetch(URL_OF_EVENT, init));
        }

        for (const method of ['REPORT', 'MKCALENDAR', 'MKCOL', 'MOVE', 'COPY', 'PROPPATCH', 'POST', 'LOCK']) {
            const error = await rejection(fetch(URL_OF_EVENT, { method }));

            expect(error.message).toBe(`calendar: method ${method} is not allowed`);
        }

        // a Request carries its own headers and redirect mode: only a URL is accepted for a write
        await rejection(fetch(new Request(URL_OF_EVENT, {
            method: 'PUT', 
            body: 'x', 
            headers: { 'If-None-Match': '*' }, 
        })));
        await rejection(fetch(new Request(URL_OF_EVENT, { method: 'DELETE', headers: { 'If-Match': '"0"' } })));
        await rejection(fetch(new Request(URL_OF_EVENT), { method: 'PUT', headers: { 'If-None-Match': '*' } }));
        await rejection(fetch(new Request(URL_OF_EVENT, { method: 'REPORT' })));

        expect(seen).toHaveLength(0);
    });
});
