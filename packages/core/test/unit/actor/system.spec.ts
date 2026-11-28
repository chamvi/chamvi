/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IPermissionEvaluator } from '@authup/access';
import { describe, expect, it } from 'vitest';
import {
    SystemPermissionEvaluator,
    createSystemActor,
    isActorGranted,
    isActorGrantedSome,
    isSystemActor,
} from '@chamvi/core';

describe('system actor', () => {
    it('is recognized as the system actor', () => {
        const actor = createSystemActor();

        expect(isSystemActor(actor)).toBe(true);
        expect(actor.identity).toEqual({
            id: 'system', 
            kind: 'system', 
            bindings: [], 
        });
        expect(actor.permissionEvaluator).toBeInstanceOf(SystemPermissionEvaluator);
    });

    it('is recognized by the object only, never by its shape', () => {
        const actor = createSystemActor();

        expect(isSystemActor({ ...actor })).toBe(false);
        expect(isSystemActor({ permissionEvaluator: actor.permissionEvaluator, identity: structuredClone(actor.identity) })).toBe(false);
        expect(isSystemActor({
            permissionEvaluator: new SystemPermissionEvaluator(),
            identity: {
                id: 'system', 
                kind: 'system', 
                bindings: [], 
            },
        })).toBe(false);
        expect(isSystemActor(undefined)).toBe(false);
        expect(isSystemActor(null)).toBe(false);
        expect(isSystemActor('system')).toBe(false);
    });

    it('builds a distinct actor per call', () => {
        const first = createSystemActor();
        const second = createSystemActor();

        expect(first).not.toBe(second);
        expect(isSystemActor(second)).toBe(true);
    });

    it('is granted every permission', async () => {
        const actor = createSystemActor();

        expect(await isActorGranted(actor, 'anything')).toBe(true);
        expect(await isActorGranted(actor, 'anything', { agent: 'x' })).toBe(true);
        expect(await isActorGrantedSome(actor, 'anything')).toBe(true);
    });

    it('lets every evaluator method pass and compiles to allow', async () => {
        const evaluator: IPermissionEvaluator = new SystemPermissionEvaluator();

        await expect(evaluator.evaluate({ name: 'x' })).resolves.toBeUndefined();
        await expect(evaluator.evaluateOneOf({ name: ['x', 'y'] })).resolves.toBeUndefined();
        await expect(evaluator.preEvaluate({ name: 'x' })).resolves.toBeUndefined();
        await expect(evaluator.preEvaluateOneOf({ name: ['x', 'y'] })).resolves.toBeUndefined();
        await expect(evaluator.compile({ name: 'x' })).resolves.toEqual({ verdict: 'allow' });
    });
});
