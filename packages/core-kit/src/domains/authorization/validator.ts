/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createValidator } from '@validup/zod';
import { Container } from 'validup';
import { arraySchema, stringSchema } from '../../helpers/schemas/index.ts';
import { AUTHORIZATION_CHECK_MAX_NAMES, AUTHORIZATION_CHECK_NAME_MAX_LENGTH } from './constants.ts';
import type { AuthorizationCheckBody } from './types.ts';

/** A permission check (`POST /authorization/check`). */
export class AuthorizationValidator extends Container<AuthorizationCheckBody> {
    protected override initialize() {
        super.initialize();

        this.mount(
            'names',
            { optional: true },
            createValidator(arraySchema(stringSchema({ min: 1, max: AUTHORIZATION_CHECK_NAME_MAX_LENGTH }), { max: AUTHORIZATION_CHECK_MAX_NAMES, noun: 'strings' })),
        );
    }
}
