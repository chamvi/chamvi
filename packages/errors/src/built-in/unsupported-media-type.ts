/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { markInstanceof } from '@ebec/core';
import { ErrorCode } from '../constants.ts';
import { ChamviError } from '../module.ts';
import type { ChamviErrorOptions } from '../types.ts';

export const UNSUPPORTED_MEDIA_TYPE_ERROR_INSTANCE = Symbol.for('@chamvi/errors/UnsupportedMediaTypeError');

export class UnsupportedMediaTypeError extends ChamviError {
    constructor(input?: string | ChamviErrorOptions) {
        const options: ChamviErrorOptions = typeof input === 'string' ? { message: input } : (input ?? {});

        super({
            code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
            message: 'Unsupported Media Type',
            ...options,
        });
        markInstanceof(this, UNSUPPORTED_MEDIA_TYPE_ERROR_INSTANCE);
    }
}
