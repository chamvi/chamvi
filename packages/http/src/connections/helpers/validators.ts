/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { IssueCode } from '@ebec/core';
import { isObject } from 'smob';
import { createValidupError, defineValidator } from 'validup';
import type { ValidatorDescriptor } from 'validup';

/*
 * Connection bodies carry secrets and may place them anywhere: these
 * validators, and the field checks of `config.ts`, never echo a value.
 */

/** A plain object, with its values left to the caller. */
export function isRecord(): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (!isObject(value)) {
                throw createValidupError(undefined, IssueCode.VALUE_INVALID, 'must be an object');
            }

            return value;
        },
    });
}

/** The longest connection name: an account id is never longer than the name built from it. */
const ACCOUNT_ID_MAX_LENGTH = 64;

/** A create's account id; the name it builds is checked by the connection-name rule. */
export function isAccountId(): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (typeof value !== 'string' || value.length === 0 || value.length > ACCOUNT_ID_MAX_LENGTH || value.includes('\0')) {
                throw createValidupError(undefined, IssueCode.VALUE_INVALID, `must be a string of 1 to ${ACCOUNT_ID_MAX_LENGTH} characters`);
            }

            return value;
        },
    });
}

/** `{ set?: { <field>: string }, clear?: string[] }` of a save. */
export function isSecretsWrite(): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (!isObject(value)) {
                throw createValidupError(undefined, IssueCode.VALUE_INVALID, 'must be an object');
            }

            const { set, clear } = value;

            if (set !== undefined && !isObject(set)) {
                throw createValidupError(undefined, IssueCode.VALUE_INVALID, 'set must be an object');
            }

            const isNameList = Array.isArray(clear) && clear.every((field) => typeof field === 'string');

            if (clear !== undefined && !isNameList) {
                throw createValidupError(undefined, IssueCode.VALUE_INVALID, 'clear must be an array of field names');
            }

            return { ...(set !== undefined && { set }), ...(clear !== undefined && { clear }) };
        },
    });
}
