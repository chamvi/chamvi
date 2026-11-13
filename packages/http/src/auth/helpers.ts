/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { 
    can, 
    canSome, 
    isPermissionAuthorization, 
    isPermissionBinding, 
} from '@chamvi/access';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { Agent, IClock, Invoker } from '@chamvi/core';
import { ForbiddenError, UnauthorizedError } from '@ebec/http';
import type { IAppEvent } from 'routup';
import { isObject } from 'smob';
import { useHttpContext } from '../app/helpers.ts';
import type { HttpContext } from '../app/types.ts';
import { PRINCIPAL } from './constants.ts';
import type { Authenticator, Principal } from './types.ts';

/**
 * Claims read as the invoker's display name, first non-empty string wins.
 * Never `email`: the name reaches every reader of the run.
 */
const NAME_CLAIMS = ['name', 'preferred_username'] as const;

/**
 * The run invoker (or approver) for a principal: a snapshot of `id`,
 * `kind`, `bindings`, `authorization` and `identity`, plus a display `name` from the claims
 * (`name`, then `preferred_username`; never `email`). Never carries the
 * claims themselves.
 */
export function toInvoker(principal: Principal): Invoker {
    const name = NAME_CLAIMS
        .map((key) => principal.claims?.[key])
        .find((value): value is string => typeof value === 'string' && value.length > 0);

    return {
        id: principal.id,
        kind: principal.kind,
        ...(name !== undefined ? { name } : {}),
        bindings: [...principal.bindings],
        ...(principal.authorization !== undefined ? { authorization: structuredClone(principal.authorization) } : {}),
        ...(principal.identity !== undefined ? { identity: { ...principal.identity } } : {}),
    };
}

/**
 * The bearer token of a request: `undefined` without an authorization
 * header, 401 for another scheme or an empty value.
 */
export function readBearerToken(request: Request): string | undefined {
    const header = request.headers.get('authorization');

    if (header === null) {
        return undefined;
    }

    const match = /^bearer +(\S+) *$/i.exec(header);

    if (!match?.[1]) {
        throw new UnauthorizedError({ message: 'The authorization header is malformed.' });
    }

    return match[1];
}

/**
 * True for a principal every route can rely on: a non-empty `id` and `kind`,
 * `bindings` an array of permission bindings, when given an `authorization`
 * that passes `isPermissionAuthorization` (shallow) and an `identity` of type
 * `user` or `client` with a non-empty `id`.
 */
export function isPrincipal(value: Principal): boolean {
    return typeof value.id === 'string' &&
        value.id.length > 0 &&
        typeof value.kind === 'string' &&
        value.kind.length > 0 &&
        Array.isArray(value.bindings) &&
        value.bindings.every((binding) => isPermissionBinding(binding)) &&
        (value.authorization === undefined || isPermissionAuthorization(value.authorization)) &&
        (value.identity === undefined || isIdentity(value.identity));
}

function isIdentity(value: unknown): boolean {
    return isObject(value) &&
        (value.type === 'user' || value.type === 'client') &&
        typeof value.id === 'string' &&
        value.id.length > 0;
}

/**
 * Whether the principal holds `permission` for the resource `attributes`,
 * at the clock's time; without attributes, for every resource of that kind.
 */
export function isGranted(principal: Principal, permission: string, clock: IClock, attributes?: Record<string, unknown>): Promise<boolean> {
    return can(principal, permission, { ...(attributes !== undefined ? { attributes } : {}), now: clock.now() });
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
    return canSome(principal, permission, { now: clock.now() });
}

/**
 * Runs `authenticators` in order over `request`: the first principal wins;
 * a throw is remembered (and rethrown when no later one resolves), so the
 * chain goes on; none at all is a 401. A principal `isPrincipal` refuses is
 * a server misconfiguration (InvalidAgentDefinitionError).
 */
export async function resolvePrincipal(request: Request, authenticators: readonly Authenticator[]): Promise<Principal> {
    let rejection: unknown;

    for (const authenticator of authenticators) {
        let principal: Principal | undefined;

        try {
            principal = await authenticator(request);
        } catch (error) {
            rejection ??= error;

            continue;
        }

        if (!principal) {
            continue;
        }

        // a server misconfiguration (500 and onError), never a client error nor a reason to try the next authenticator
        if (!isPrincipal(principal)) {
            throw new InvalidAgentDefinitionError('An authenticator resolved a principal without a non-empty id and kind, a bindings array of permission bindings and a well-formed authorization.');
        }

        return principal;
    }

    throw rejection ?? new UnauthorizedError({ message: 'Authentication required.' });
}

/** Runs the authenticator chain once per request; the first principal wins. */
export function authenticate(event: IAppEvent, ctx: HttpContext): Promise<Principal> {
    let pending = event.store[PRINCIPAL] as Promise<Principal> | undefined;

    if (!pending) {
        pending = resolvePrincipal(event.request, ctx.authenticators);
        event.store[PRINCIPAL] = pending;
    }

    return pending;
}

/** The principal of a request inside `createHttpApp`: `authenticate` with the event's context. */
export function usePrincipal(event: IAppEvent): Promise<Principal> {
    return authenticate(event, useHttpContext(event));
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

/** The 403 of a permission the principal does not hold. */
export function forbidden(permission: string): ForbiddenError {
    return new ForbiddenError({ message: `Missing permission "${permission}".` });
}
