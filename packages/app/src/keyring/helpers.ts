/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { ENV_ENCRYPTION_KEYS } from './constants.ts';

const UNSET_MESSAGE = `${ENV_ENCRYPTION_KEYS} is not set: a module that stores connections needs it (\`<id>:<base64 32 bytes>\`, comma separated, the first active).`;

/** The error of a keyring read while `CHAMVI_ENCRYPTION_KEYS` is unset. */
export function keyringUnsetError(): InvalidAgentDefinitionError {
    return new InvalidAgentDefinitionError(UNSET_MESSAGE);
}

/** Whether `error` is the unset-keyring error of `readKeyring()`, not another configuration error. */
export function isKeyringUnsetError(error: unknown): boolean {
    return error instanceof InvalidAgentDefinitionError && error.message === UNSET_MESSAGE;
}
