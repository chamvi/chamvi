/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError, createKeyring, parseKeyring } from '@chamvi/core';
import type { IKeyring } from '@chamvi/core';
import type { Env } from '../env/types.ts';
import { ENV_ENCRYPTION_KEYS } from './constants.ts';

/**
 * The keyring of `CHAMVI_ENCRYPTION_KEYS`. InvalidAgentDefinitionError when
 * it is unset or malformed; the message names the variable and the problem,
 * never a key or any part of the value.
 */
export function readKeyring(env: Env): IKeyring {
    const value = env[ENV_ENCRYPTION_KEYS];

    if (value === undefined || value.trim().length === 0) {
        throw new InvalidAgentDefinitionError(
            `${ENV_ENCRYPTION_KEYS} is not set: a module that stores connections needs it (\`<id>:<base64 32 bytes>\`, comma separated, the first active).`,
        );
    }

    try {
        return createKeyring(parseKeyring(value));
    } catch (error) {
        // parseKeyring and createKeyring name the entry index, never the input
        throw new InvalidAgentDefinitionError(`${ENV_ENCRYPTION_KEYS}: ${(error as Error).message}`);
    }
}
