/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { can, canSome } from '@chamvi/access';
import { forbidden } from '@chamvi/core';
import type { Agent, IClock } from '@chamvi/core';
import type { IAppEvent } from 'routup';
import { useHttpContext } from '../../app/helpers/index.ts';
import type { HttpContext } from '../../app/types.ts';
import type { Principal } from '../types.ts';
import { authenticate } from './principal.ts';

/**
 * Whether the principal holds `permission` for the resource `attributes`,
 * at the clock's time; without attributes, for every resource of that kind.
 */
export function isGranted(principal: Principal, permission: string, clock: IClock, attributes?: Record<string, unknown>): Promise<boolean> {
    return can(principal, permission, { ...(attributes !== undefined ? { attributes } : {}), now: new Date(clock.now()) });
}

/**
 * The resource attributes of the agent `name` (`{ name, private }`): an
 * agent the app does not hold counts as private, so a check fails closed.
 */
export function agentResource(name: string, agent: Agent | undefined): { name: string; private: boolean } {
    return { name, private: agent ? agent.definition.private === true : true };
}

/** Whether the principal holds `permission` for some resource (a collection gate). */
export function isGrantedSome(principal: Principal, permission: string, clock: IClock): Promise<boolean> {
    return canSome(principal, permission, { now: new Date(clock.now()) });
}

/**
 * 403 unless the principal holds `permission`: for the resource
 * `attributes` when given (`can`), else for some resource (`canSome`, a
 * collection gate), at the clock's time.
 */
export async function assertGranted(
    principal: Principal,
    clock: IClock,
    permission: string,
    attributes?: Record<string, unknown>,
): Promise<void> {
    const granted = attributes !== undefined ?
        await isGranted(principal, permission, clock, attributes) :
        await isGrantedSome(principal, permission, clock);

    if (!granted) {
        throw forbidden(permission);
    }
}

/**
 * `authenticate`, then `assertGranted` when `permission` is given, at the
 * engine clock's time.
 */
export async function authorize(
    event: IAppEvent,
    ctx: HttpContext,
    permission?: string,
    attributes?: Record<string, unknown>,
): Promise<Principal> {
    const principal = await authenticate(event, ctx);

    if (permission !== undefined) {
        await assertGranted(principal, ctx.clock, permission, attributes);
    }

    return principal;
}

/**
 * `authorize` with the context `createHttpApp` put on the event, for a
 * controller or service: the principal (401 without one), then 403 unless it
 * holds `permission` (when given) for the resource `attributes`, or without
 * attributes for some resource. The chain runs once per request.
 */
export function authorizeRequest(
    event: IAppEvent,
    permission?: string,
    attributes?: Record<string, unknown>,
): Promise<Principal> {
    return authorize(event, useHttpContext(event), permission, attributes);
}
