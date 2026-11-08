/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IConnectionVault } from '@chamvi/core';

export type StoreWhatsAppAuthOptions = {
    /** The vault of the app's store and keyring (createConnectionVault()). */
    vault: IConnectionVault;
    /** The connection name (agent-name rule); one WhatsApp account per connection. */
    connection: string;
    /** The lease owner; default `${hostname}-${pid}`, the engine's owner format. */
    owner?: string;
    /** The lease TTL; default the vault's (60 s): a crashed holder blocks a new one for at most this long. */
    leaseTtlMs?: number;
};
