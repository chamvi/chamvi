/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createDAVClient } from 'tsdav';
import { calendarError } from './asserts.ts';
import { guardedFetch } from './guard.ts';
import type { CalendarAccount } from './types.ts';

/**
 * Logs in to `account` the way the client does: tsdav's authenticated PROPFINDs
 * of the URL (following a provider's redirect to its partition host) through
 * the read-only fetch. Bounded by `signal`. The failures are fixed sentences,
 * never the server's text.
 */
export async function verifyCalendarLogin(
    account: CalendarAccount,
    options: { signal: AbortSignal; fetch?: typeof fetch },
): Promise<void> {
    const { signal } = options;
    const inner = options.fetch ?? fetch;
    let refused = false;
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
    });

    signal.throwIfAborted();

    try {
        await Promise.race([
            createDAVClient({
                serverUrl: account.url,
                credentials: { username: account.user as string, password: account.password as string },
                authMethod: 'Basic',
                defaultAccountType: 'caldav',
                fetch: guardedFetch(async (input, init) => {
                    // the request that ended the login decides: tsdav ignores what its `/.well-known` probe
                    // answers (a web server denying dot paths says 403), and a dropped connection is no refusal
                    refused = false;

                    const response = await inner(input, init);

                    refused = response.status === 401 || response.status === 403;

                    return response;
                }),
                fetchOptions: { signal },
            }),
            aborted,
        ]);
    } catch {
        signal.throwIfAborted();

        throw calendarError(refused ?
            'The CalDAV server refused the user or password.' :
            'The CalDAV server cannot be reached, or the URL is no CalDAV server.');
    } finally {
        if (onAbort) {
            signal.removeEventListener('abort', onAbort);
        }
    }
}
