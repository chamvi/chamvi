/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const Permission = {
    ALL: '*',
    RUN_READ: 'run:read',
    RUN_CANCEL: 'run:cancel',
    STATE_READ: 'state:read',
    STATE_WRITE: 'state:write',
} as const;

/**
 * Creates accounts of a connection type. Not `connection:create`, which the
 * read grant `connection:*` would match.
 */
export const CONNECTIONS_CREATE_PERMISSION = 'connections:create';

/** Where `authenticate` memoizes the principal in `event.store`; internal. */
export const PRINCIPAL = Symbol('chamvi:principal');
