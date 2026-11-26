/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Issue } from '@ebec/core';
import { markInstanceof } from '@ebec/core';
import { ErrorCode } from '../constants.ts';
import { ChamviError } from '../module.ts';

export const VALIDATION_ERROR_INSTANCE = Symbol.for('@chamvi/errors/ValidationError');

/**
 * A value failed its validation (e.g. a state document on upsert). Not
 * named after an HTTP status: core code stays transport-agnostic, and an
 * http adapter maps `ErrorCode.VALIDATION` to 400 (`httpStatusFromCode`).
 * `issues` holds the validup issues.
 */
export class ValidationError extends ChamviError {
    constructor(message: string, issues: readonly Issue[] = []) {
        super({
            message,
            code: ErrorCode.VALIDATION,
            issues,
        });
        markInstanceof(this, VALIDATION_ERROR_INSTANCE);
    }
}
