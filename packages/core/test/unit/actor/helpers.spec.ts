/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IPermissionEvaluator } from '@authup/access';
import { describe, expect, it } from 'vitest';
import type { PermissionBinding, PermissionHolder } from '@chamvi/access';
import {
    HolderPermissionEvaluator,
    Permission,
    can,
    canSome,
} from '@chamvi/access';
import { ForbiddenError, httpStatusOf } from '@chamvi/errors';
import type { ActorContext } from '@chamvi/core';
import { forbidden, isActorGranted, isActorGrantedSome } from '@chamvi/core';

function restricted(name: string, query: Record<string, unknown>): PermissionBinding {
    return {
        permission: { name },
        policies: [{ type: 'attributes', query } as never],
    };
}

const NOW = new Date(2026, 10, 11, 10, 0);

const HOLDERS: [string, PermissionHolder][] = [
    ['no bindings', { bindings: [] }],
    ['an unrestricted binding', { bindings: [{ permission: { name: Permission.RUN_READ } }] }],
    ['a restricted binding', { bindings: [restricted(Permission.RUN_READ, { agent: 'echo' })] }],
    ['an expired binding', {
        bindings: [{
            permission: { name: Permission.RUN_READ },
            policies: [{ type: 'date', end: '2026-01-01' } as never],
        }],
    }],
];

const ATTRIBUTES: (Record<string, unknown> | undefined)[] = [undefined, { agent: 'echo' }, { agent: 'x' }];

function actorOf(holder: PermissionHolder): ActorContext {
    return { permissionEvaluator: new HolderPermissionEvaluator(holder, { now: () => NOW }) };
}

describe('actor helpers', () => {
    it.each(HOLDERS)('isActorGranted decides as can for %s', async (_label, holder) => {
        for (const name of [Permission.RUN_READ, Permission.AGENT_READ]) {
            for (const attributes of ATTRIBUTES) {
                const expected = await can(holder, name, { ...(attributes ? { attributes } : {}), now: NOW });

                expect(await isActorGranted(actorOf(holder), name, attributes)).toBe(expected);
            }
        }
    });

    it.each(HOLDERS)('isActorGrantedSome decides as canSome for %s', async (_label, holder) => {
        for (const name of [Permission.RUN_READ, Permission.AGENT_READ]) {
            const expected = await canSome(holder, name, { now: NOW });

            expect(await isActorGrantedSome(actorOf(holder), name)).toBe(expected);
        }
    });

    it('separates the two checks on a restricted binding', async () => {
        const actor = actorOf({ bindings: [restricted(Permission.RUN_READ, { agent: 'echo' })] });

        expect(await isActorGranted(actor, Permission.RUN_READ, { agent: 'x' })).toBe(false);
        expect(await isActorGrantedSome(actor, Permission.RUN_READ)).toBe(true);
    });

    it('propagates an evaluator failure that is no permission error', async () => {
        const failure = new Error('evaluator down');
        const reject = () => Promise.reject(failure);
        const evaluator: IPermissionEvaluator = {
            evaluate: reject,
            evaluateOneOf: reject,
            preEvaluate: reject,
            preEvaluateOneOf: reject,
            compile: reject,
        };

        await expect(isActorGranted({ permissionEvaluator: evaluator }, 'x')).rejects.toBe(failure);
        await expect(isActorGrantedSome({ permissionEvaluator: evaluator }, 'x')).rejects.toBe(failure);
    });

    it('builds the 403 of a missing permission', () => {
        const error = forbidden('x');

        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toBe('Missing permission "x".');
        expect(httpStatusOf(error)).toBe(403);
    });
});
