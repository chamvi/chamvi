/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isPermissionPolicyBinding } from '@authup/access';
import type { PermissionBinding } from '@chamvi/access';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { StaticToken } from '@chamvi/http';
import { isObject } from 'smob';
import type { Env } from '../env/index.ts';
import { envJson } from '../env/index.ts';
import { TOKEN_VALUE_MIN_LENGTH } from './constants.ts';
import type { AppConfig, ApprovalRef } from './types.ts';

const TOKENS = 'CHAMVI_TOKENS';

/**
 * A token's `permissions`: `"*"` (every chamvi permission, unrestricted) or
 * an array of permission bindings, copied. Anything else, also a string
 * entry in the array, is undefined.
 */
function readPermissions(input: unknown): readonly PermissionBinding[] | '*' | undefined {
    if (input === '*') {
        return input;
    }

    if (!Array.isArray(input)) {
        return undefined;
    }

    const invalid = input.some((entry) => !isPermissionPolicyBinding(entry));

    if (invalid) {
        return undefined;
    }

    return structuredClone(input);
}

/**
 * CHAMVI_TOKENS as static tokens. Messages name the index, never a token value.
 */
export function readTokens(env: Env): StaticToken[] | undefined {
    const input = envJson(env, TOKENS);

    if (typeof input === 'undefined') {
        return undefined;
    }

    if (!Array.isArray(input) || input.length === 0) {
        throw new InvalidAgentDefinitionError(`${TOKENS} must be a non-empty JSON array.`);
    }

    const seen = new Set<string>();

    return input.map((item: unknown, index) => {
        const at = `${TOKENS}[${index}]`;

        if (!isObject(item)) {
            throw new InvalidAgentDefinitionError(`${at} must be an object.`);
        }

        const {
            value,
            id,
            permissions,
        } = item;

        if (typeof value !== 'string' || value.length < TOKEN_VALUE_MIN_LENGTH) {
            throw new InvalidAgentDefinitionError(`${at}.value must be at least ${TOKEN_VALUE_MIN_LENGTH} characters.`);
        }

        if (seen.has(value)) {
            throw new InvalidAgentDefinitionError(`${at}.value is given more than once.`);
        }

        seen.add(value);

        if (typeof id !== 'string' || id.length === 0) {
            throw new InvalidAgentDefinitionError(`${at}.id must be a non-empty string.`);
        }

        const bindings = readPermissions(permissions);

        if (typeof bindings === 'undefined') {
            throw new InvalidAgentDefinitionError(`${at}.permissions must be "*" or an array of permission bindings.`);
        }

        return {
            value,
            id,
            permissions: bindings,
        };
    });
}

/**
 * The token-less UI approval link (`<publicUrl><basePath>/ui/approvals?run=&approval=`),
 * or undefined without CHAMVI_PUBLIC_URL.
 */
export function approvalUrlOf(config: AppConfig): ((ref: ApprovalRef) => string) | undefined {
    const { publicUrl, basePath } = config.http;

    if (typeof publicUrl === 'undefined') {
        return undefined;
    }

    return ({ runId, approvalId }) => `${publicUrl}${basePath}/ui/approvals` +
        `?run=${encodeURIComponent(runId)}&approval=${encodeURIComponent(approvalId)}`;
}
