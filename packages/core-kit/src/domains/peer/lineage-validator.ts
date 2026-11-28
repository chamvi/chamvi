/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createValidator } from '@validup/zod';
import { Container } from 'validup';
import { booleanSchema, stringSchema } from '../../helpers/schemas/index.ts';
import { TRIGGER_KEY_MAX_LENGTH } from '../trigger/constants.ts';
import { PEER_ORIGIN_MAX_LENGTH } from './constants.ts';
import { PeerParentValidator } from './parent-validator.ts';
import type { PeerStartBody } from './types.ts';

/** The caller's lineage on a peer start (`peer`). */
export class PeerLineageValidator extends Container<PeerStartBody> {
    protected override initialize() {
        super.initialize();

        this.mount('standIn', createValidator(stringSchema({ min: 1, max: TRIGGER_KEY_MAX_LENGTH })));
        this.mount('parent', new PeerParentValidator());
        this.mount('taint', createValidator(booleanSchema()));
        this.mount('origin', { optional: true }, createValidator(stringSchema({ min: 1, max: PEER_ORIGIN_MAX_LENGTH })));
    }
}
