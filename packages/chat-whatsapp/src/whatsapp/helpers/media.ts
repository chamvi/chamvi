/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { downloadMediaMessage } from 'baileys';
import type { WAMessage } from 'baileys';
import { SILENT_LOGGER } from '../constants.ts';
import type { WhatsAppSocket } from '../types.ts';

/**
 * Downloads a media message's bytes through Baileys (default of
 * `WhatsAppChatOptions.downloadMedia`). An expired media link is renewed
 * through the socket's `updateMediaMessage`; nothing is logged.
 */
export async function downloadWhatsAppMedia(message: WAMessage, socket: WhatsAppSocket): Promise<Uint8Array> {
    const { updateMediaMessage } = socket;

    return downloadMediaMessage(
        message,
        'buffer',
        {},
        updateMediaMessage ? { reuploadRequest: (value) => updateMediaMessage(value), logger: SILENT_LOGGER } : undefined,
    );
}
