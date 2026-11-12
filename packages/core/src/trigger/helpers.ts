/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isPermissionPolicyBinding } from '@authup/access';
import type { PermissionIdentity } from '@chamvi/access';
import { isObject } from 'smob';
import { ValidationError } from '../errors/index.ts';
import type { Invoker, TriggerEnvelope } from './types.ts';

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * Validates an invoker (or approver) and returns a copy holding only the
 * invoker fields; throws ValidationError otherwise.
 */
export function toInvoker(value: unknown, label = 'invoker'): Invoker {
    if (!isObject(value)) {
        throw new ValidationError(`The ${label} must be an object.`);
    }

    const {
        id,
        kind,
        name,
        bindings,
        identity,
    } = value as Record<string, unknown>;

    if (!isNonEmptyString(id)) {
        throw new ValidationError(`The ${label} needs a non-empty id.`);
    }

    if (!isNonEmptyString(kind)) {
        throw new ValidationError(`The ${label} needs a non-empty kind.`);
    }

    if (name !== undefined && typeof name !== 'string') {
        throw new ValidationError(`The ${label} name must be a string.`);
    }

    const validBindings = Array.isArray(bindings) && bindings.every((p) => isPermissionPolicyBinding(p));

    if (!validBindings) {
        throw new ValidationError(`The ${label} bindings must be an array of permission bindings.`);
    }

    if (identity !== undefined) {
        assertIdentity(identity, label);
    }

    return structuredClone({
        id,
        kind,
        ...(name !== undefined ? { name } : {}),
        bindings,
        ...(identity !== undefined ? { identity } : {}),
    });
}

function assertIdentity(value: unknown, label: string): asserts value is PermissionIdentity {
    if (
        !isObject(value) ||
        (value.type !== 'user' && value.type !== 'client') ||
        !isNonEmptyString(value.id)
    ) {
        throw new ValidationError(`The ${label} identity needs a type "user" or "client" and a non-empty id.`);
    }
}

/**
 * The idempotency scope of an envelope: `<agent>:<channel>`, plus
 * `:<kind>:<id>` of the invoker when there is one (each part
 * URI-encoded, so a `:` inside cannot make two invokers collide).
 */
export function idempotencyScope(envelope: Pick<TriggerEnvelope, 'agent' | 'channel' | 'invoker'>): string {
    const base = `${envelope.agent}:${envelope.channel}`;
    const { invoker } = envelope;

    if (!invoker) {
        return base;
    }

    return `${base}:${encodeURIComponent(invoker.kind)}:${encodeURIComponent(invoker.id)}`;
}

/**
 * A stored envelope as the current shape: envelopes written before channels
 * hold `source` and `thread`, which fill `channel` and `address` when those
 * are absent. Both legacy keys are dropped; the input is not changed. Repository
 * implementations call it on every envelope they read back.
 */
export function normalizeEnvelope(raw: Record<string, unknown>): TriggerEnvelope {
    const {
        source,
        thread,
        ...rest
    } = raw;
    const output: Record<string, unknown> = { ...rest };

    if (output.channel === undefined && source !== undefined) {
        output.channel = source;
    }

    if (output.address === undefined && thread !== undefined) {
        output.address = thread;
    }

    return output as TriggerEnvelope;
}
