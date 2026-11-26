/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ChamviErrorInput } from './types.ts';
import {
    BaseError,
    markInstanceof,
} from '@ebec/core';

export const CHAMVI_ERROR_INSTANCE = Symbol.for('@chamvi/errors/ChamviError');

export class ChamviError extends BaseError {
    public readonly data?: Record<string, any>;

    constructor(input?: ChamviErrorInput) {
        super(input);
        markInstanceof(this, CHAMVI_ERROR_INSTANCE);

        if (input && typeof input !== 'string' && input.data) {
            this.data = input.data;
        }
    }

    /**
     * The `data` payload is spread first, so a `data` key cannot displace a
     * base field (`name`, `message`, `code`, the serialized marker chain).
     */
    override toJSON() : ReturnType<BaseError['toJSON']> & Record<string, any> {
        return {
            ...(this.data ?? {}),
            ...super.toJSON(),
        };
    }
}
