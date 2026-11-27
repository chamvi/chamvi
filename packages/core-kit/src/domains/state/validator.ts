/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createValidator } from '@validup/zod';
import { Container } from 'validup';
import { definedSchema } from '../../helpers/schemas/index.ts';
import type { KvWriteBody } from './types.ts';

/** A kv write (`PATCH /agents/{name}/state/kv/{key}`): any value, `null` included. */
export class StateValidator extends Container<KvWriteBody> {
    protected override initialize() {
        super.initialize();

        this.mount('value', createValidator(definedSchema()));
    }
}
