/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IConnectionHandle } from '@chamvi/core';
import type { WhatsAppChatOptions, WhatsAppConnectionStatus, WhatsAppPairing } from '../whatsapp/types.ts';

export type WhatsAppModuleOptions = Omit<WhatsAppChatOptions, 'auth' | 'onPairing' | 'onStatus' | 'approvalUrl'> & {
    /** The connection (agent-name rule) whose sealed entries hold the session. */
    connection: string;
    /** The session lease TTL; default 60 s (a crashed holder blocks the next for at most this long). */
    leaseTtlMs?: number;
    /** The approval link; default the dashboard's approvals page under `CHAMVI_PUBLIC_URL`. */
    approvalUrl?: WhatsAppChatOptions['approvalUrl'];
};

/** A handle and the connection callbacks feeding it (internal). */
export type WhatsAppHandle = {
    handle: IConnectionHandle;
    /** the connection's onPairing */
    onPairing(pairing: WhatsAppPairing): void;
    /** the connection's onStatus */
    onStatus(status: WhatsAppConnectionStatus): void;
};
