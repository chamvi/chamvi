/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createValidator } from '@validup/zod';
import { Container } from 'validup';
import { integerSchema, nameSchema, stringSchema } from '../../helpers/schemas/index.ts';
import { DISPATCH_DEPTH_MAX } from '../dispatch/constants.ts';
import { TRIGGER_KEY_MAX_LENGTH } from '../trigger/constants.ts';
import type { PeerStartBody } from './types.ts';

/** The calling run of a peer start (`peer.parent`). */
export class PeerParentValidator extends Container<PeerStartBody['parent']> {
    protected override initialize() {
        super.initialize();

        this.mount('runId', createValidator(stringSchema({ min: 1, max: TRIGGER_KEY_MAX_LENGTH })));
        this.mount('agent', createValidator(nameSchema()));
        this.mount('depth', createValidator(integerSchema({ min: 0, max: DISPATCH_DEPTH_MAX })));
    }
}
