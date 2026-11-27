/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createValidator } from '@validup/zod';
import { nameSchema } from '../../helpers/schemas/index.ts';
import { RunValidator } from '../run/validator.ts';
import { PeerLineageValidator } from './lineage-validator.ts';
import type { PeerStartRunBody } from './types.ts';

/** A peer's start: the start body with `role` and `peer` required; unknown keys are dropped. */
export class PeerStartValidator extends RunValidator<PeerStartRunBody> {
    protected override initialize() {
        super.initialize();

        this.mount('role', createValidator(nameSchema()));
        this.mount('peer', new PeerLineageValidator());
    }
}
