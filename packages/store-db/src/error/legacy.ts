/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseError } from '@ebec/core';
import { STORE_LEGACY_SCHEMA_CODE } from '../schema/constants.ts';

/** The database holds a chamvi schema from before the uuid baseline (`store_legacy_schema`). */
export class LegacySchemaError extends BaseError {
    constructor() {
        super({
            message: 'This database holds a chamvi schema from an earlier version that cannot be upgraded in place. ' +
                'Start on a new, empty database; see the upgrade guide (https://chamvi.dev/guide/upgrading).',
            code: STORE_LEGACY_SCHEMA_CODE,
        });
    }
}
