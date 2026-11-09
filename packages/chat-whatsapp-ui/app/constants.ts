/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionTypeWire } from '@chamvi/ui-kit';

/**
 * The accounts column's view of the type: `whatsappModule()` declares no
 * settings, so `GET /connection-types` has no entry for it. One session per
 * module: nothing to add here.
 */
export const WHATSAPP_TYPE: ConnectionTypeWire = {
    type: 'whatsapp',
    label: 'WhatsApp',
    multiple: false,
    creatable: false,
    testable: false,
    fields: [],
};
