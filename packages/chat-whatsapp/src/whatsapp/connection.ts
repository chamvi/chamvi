/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { WhatsAppSession } from './session.ts';
import type { WhatsAppConnection, WhatsAppConnectionOptions } from './types.ts';

/**
 * The WhatsApp connection: `connect` acquires the lease (the provider's
 * exclusivity), then builds a socket over it; Baileys' connection events
 * alone set the status (`pairing` while a QR is outstanding). An unexpected
 * close reconnects with backoff on the clock; a logout or a replacing
 * session does not.
 *
 * `connect` resolves once its first acquire settled: a refused acquire
 * (ConnectionHeldError, by code) sets `held-elsewhere` and retries on the
 * clock with the WHATSAPP_RECONNECT backoff and no attempt cap; any other
 * acquire failure sets `failed` and retries up to `maxAttempts`. A lease the
 * provider reports lost ends the socket and waits for the session the same
 * way. `reset` closes the current generation (socket, flush, release), then
 * acquires again with `reset: true`: the provider empties the session only
 * once it holds the location (the store provider recreates the connection,
 * which also recovers a data key the keyring cannot unwrap), then the fresh
 * creds are saved before the socket. A reset is refused (InvalidRunStateError)
 * by a provider without `supportsReset`, while the status is `held-elsewhere`,
 * and when its own acquire finds the session held: no clear waits for another
 * holder's lease.
 *
 * `close` (idempotent per connect) stops admitting auth calls and ends the
 * retries and reconnects, then has two bounds of WHATSAPP_SHUTDOWN_TIMEOUT_MS
 * (30 s) each: ending the socket (past it the end is abandoned and reported,
 * and the close goes on), then settling (the auth calls already admitted and
 * the lease's flush), after which it releases the lease. A failed flush is
 * reported and the lease released all the same (the failed writes are lost
 * and fenced); past the settling bound the timeout is reported and the lease
 * released once the admitted writes settle.
 */
export function createWhatsAppConnection(options: WhatsAppConnectionOptions): WhatsAppConnection {
    const session = new WhatsAppSession(options);

    return {
        status: () => session.status,
        socket: () => session.socket(),
        connect: (ctx) => session.connect(ctx),
        reset: () => session.reset(),
        close: () => session.close(),
    };
}
