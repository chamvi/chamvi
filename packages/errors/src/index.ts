/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/* eslint-disable @tada5hi/no-reexport-shims -- The instance-chain helpers belong beside the guards, as in @authup/errors. */
export {
    BASE_ERROR_INSTANCE,
    INSTANCEOF_PROPERTY,
    hasInstanceof,
    markInstanceof,
    matchesInstanceof,
    serializeInstanceofChain,
} from '@ebec/core';
/* eslint-enable @tada5hi/no-reexport-shims */
export * from './built-in/index.ts';
export * from './check.ts';
export * from './constants.ts';
export * from './module.ts';
export * from './normalize.ts';
export * from './serialize.ts';
export * from './status.ts';
export * from './types.ts';
