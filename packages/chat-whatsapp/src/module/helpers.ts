/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from '@chamvi/core';
import type {
    ConnectionStatus,
    ConnectionWidget,
    IConnectionHandle,
} from '@chamvi/core';
import { WHATSAPP_CONNECTION_TYPE } from '../auth/constants.ts';
import { WHATSAPP_CONNECTION_ERROR_CODE } from '../whatsapp/constants.ts';
import type { WhatsAppConnectionStatus } from '../whatsapp/types.ts';
import type { WhatsAppHandle } from './types.ts';

/** The generic status of a WhatsApp one: `-` becomes `_`, `stopped` is `disconnected`. */
export function toConnectionStatus(status: WhatsAppConnectionStatus): ConnectionStatus {
    if (status === 'stopped') {
        return 'disconnected';
    }

    return status.replace('-', '_') as ConnectionStatus;
}

/**
 * The connection handle of one WhatsApp channel: the latest QR is kept in
 * memory only while the status is `pairing` (any other status drops it), so
 * it never outlives the pairing and is never stored.
 */
export function createWhatsAppHandle(input: {
    name: string;
    status: () => WhatsAppConnectionStatus;
    reset: () => Promise<void>;
    onError: (error: unknown) => void;
}): WhatsAppHandle {
    const listeners = new Set<() => void>();
    let qr: string | undefined;

    const notify = () => {
        for (const listener of [...listeners]) {
            try {
                listener();
            } catch {
                // its error could carry the pairing QR: reported without it
                input.onError(new ChamviError({ code: WHATSAPP_CONNECTION_ERROR_CODE, message: 'A connection subscriber threw.' }));
            }
        }
    };

    const handle: IConnectionHandle = {
        name: input.name,
        type: WHATSAPP_CONNECTION_TYPE,
        status: () => toConnectionStatus(input.status()),
        widgets(): ConnectionWidget[] {
            return qr !== undefined && input.status() === 'pairing' ? [{ kind: 'qr', value: qr }] : [];
        },
        subscribe(listener) {
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
            };
        },
        actions: { reset: () => input.reset() },
    };

    return {
        handle,
        onPairing(pairing) {
            qr = pairing.qr;
            notify();
        },
        onStatus(status) {
            if (status !== 'pairing') {
                qr = undefined;
            }

            notify();
        },
    };
}
