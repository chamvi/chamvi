/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Permission } from './constants.ts';

export type PermissionName = typeof Permission[keyof typeof Permission];

export type AgentAction = 'run' | 'approve' | 'read';

/** What a connection permission grants: `write` implies `read`. */
export type ConnectionAction = 'read' | 'write';

export type Principal = {
    id: string;
    kind: 'token' | 'authup' | 'oidc' | (string & {});
    /** Granted permissions, e.g. `agent:triage:run`, `run:read` or `*`. */
    permissions: readonly string[];
    claims?: Record<string, unknown>;
};

/**
 * Resolves `undefined` when the request carries no credentials it
 * recognizes, throws `UnauthorizedError` for credentials it rejects.
 */
export type Authenticator = (request: Request) => Promise<Principal | undefined>;
