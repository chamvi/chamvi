/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AGENT_NAME_MAX_LENGTH, AGENT_NAME_PATTERN, BASE64_PATTERN } from '@chamvi/core-kit';
import { InvalidAgentDefinitionError } from '../errors/index.ts';
import { KEYRING_KEY_LENGTH } from './constants.ts';

/** Throws when `id` breaks the agent-name rule; the message names `label`, never the id. */
export function assertKeyId(id: unknown, label: string): asserts id is string {
    if (typeof id !== 'string' || id.length > AGENT_NAME_MAX_LENGTH || !AGENT_NAME_PATTERN.test(id)) {
        throw new InvalidAgentDefinitionError(
            `${label}: the key id must match ${AGENT_NAME_PATTERN} and be at most ${AGENT_NAME_MAX_LENGTH} characters.`,
        );
    }
}

/** Throws when `key` is not `KEYRING_KEY_LENGTH` bytes; the message names `label` only. */
export function assertKeyBytes(key: unknown, label: string): asserts key is Uint8Array {
    if (!(key instanceof Uint8Array) || key.length !== KEYRING_KEY_LENGTH) {
        throw new InvalidAgentDefinitionError(`${label}: the key must be ${KEYRING_KEY_LENGTH} bytes.`);
    }
}

/** Strict standard base64 (padding required), or undefined; Buffer alone accepts any garbage. */
export function decodeBase64(value: string): Uint8Array | undefined {
    if (value.length === 0 || !BASE64_PATTERN.test(value)) {
        return undefined;
    }

    return new Uint8Array(Buffer.from(value, 'base64'));
}
