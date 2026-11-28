/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createValidator } from '@validup/zod';
import { Container } from 'validup';
import {
    arraySchema,
    booleanSchema,
    stringSchema,
} from '../../helpers/schemas/index.ts';
import {
    APPROVAL_ID_MAX_LENGTH,
    APPROVAL_OPTIONS_MAX,
    APPROVAL_OPTION_ID_MAX_LENGTH,
    APPROVAL_REASON_MAX_LENGTH,
} from './constants.ts';
import type { ApproveBody } from './types.ts';

/** An approval answer (`POST /runs/{id}/approve`). */
export class ApprovalValidator extends Container<ApproveBody> {
    protected override initialize() {
        super.initialize();

        this.mount('approvalId', createValidator(stringSchema({ min: 1, max: APPROVAL_ID_MAX_LENGTH })));
        this.mount('approved', createValidator(booleanSchema()));
        this.mount('reason', { optional: true }, createValidator(stringSchema({ max: APPROVAL_REASON_MAX_LENGTH })));
        this.mount(
            'selected',
            { optional: true },
            createValidator(arraySchema(stringSchema({ min: 1, max: APPROVAL_OPTION_ID_MAX_LENGTH }), { max: APPROVAL_OPTIONS_MAX, noun: 'strings' })),
        );
    }
}
