/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { HolderPermissionEvaluator, Permission } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';
import { BadRequestError, ForbiddenError, NotFoundError } from '@chamvi/errors';
import { MemoryRegistry, MemoryStateDocumentRepository, MemoryStateRepository } from '@chamvi/store-memory';
import { defineQuery } from '@rapiq/core';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { z } from 'zod';
import type { ActorContext, Agent, IAgentRegistry } from '../../../src/index.ts';
import { StateService, defineSimpleAgent } from '../../../src/index.ts';

function registryOf(...agents: Agent[]): IAgentRegistry {
    return {
        get: (name) => agents.find((agent) => agent.name === name),
        names: () => agents.map((agent) => agent.name),
    };
}

function grant(name: string): PermissionBinding {
    return { permission: { name } };
}

function restricted(name: string, query: Record<string, unknown>): PermissionBinding {
    return { permission: { name }, policies: [{ type: 'attributes', query } as never] };
}

function actorOf(...bindings: PermissionBinding[]): ActorContext {
    return { permissionEvaluator: new HolderPermissionEvaluator({ bindings }, { now: () => new Date(2026, 10, 11, 10, 0) }) };
}

async function errorOf(promise: Promise<unknown>): Promise<Error> {
    return promise.then(() => {
        throw new Error('expected a rejection');
    }, (error: unknown) => error as Error);
}

const scope = {
    agents: registryOf(
        defineSimpleAgent({ name: 'echo', run: () => undefined }),
        defineSimpleAgent({
            name: 'vault',
            run: () => undefined,
            private: true,
            state: { notes: z.object({ t: z.string() }) },
        }),
    ),
};

const QUERY = defineQuery({});

describe('StateService actor methods', () => {
    let service: StateService;

    beforeEach(async () => {
        const registry = new MemoryRegistry();

        service = new StateService({
            repository: new MemoryStateRepository({ registry }),
            documentRepository: new MemoryStateDocumentRepository({ registry }),
        });

        await service.set('echo', 'k', 1);
        await service.set('vault', 'k', 2);
        await service.upsertDocument('vault', 'notes', 'n1', { t: 'x' });
    });

    it('refuses an unknown agent with 403 before its 404', async () => {
        const error = await errorOf(service.getMany('missing', QUERY, actorOf(), scope));

        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toBe('Missing permission "chamvi_state_read".');
    });

    it('answers an unknown agent with 404 once the permission holds', async () => {
        const actor = actorOf(grant(Permission.STATE_READ));

        for (const promise of [
            service.getMany('missing', QUERY, actor, scope),
            service.getOne('missing', 'k', actor, scope),
            service.getDocuments('missing', 'notes', QUERY, actor, scope),
        ]) {
            const error = await errorOf(promise);

            expect(error).toBeInstanceOf(NotFoundError);
            expect(error.message).toBe('Agent "missing" was not found.');
        }
    });

    it('checks the permission for the agent name', async () => {
        const actor = actorOf(restricted(Permission.STATE_READ, { name: 'other' }));

        await expect(service.getOne('echo', 'k', actor, scope)).rejects.toThrow('Missing permission "chamvi_state_read".');
        await expect(service.getOne('echo', 'k', actorOf(restricted(Permission.STATE_READ, { name: 'echo' })), scope)).resolves.toBe(1);
    });

    it('refuses a private agent\'s state without chamvi_agent_read', async () => {
        const error = await errorOf(service.getOne('vault', 'k', actorOf(grant(Permission.STATE_READ)), scope));

        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toBe('State of agent "vault" needs chamvi_agent_read.');
    });

    it('reads with the grants, through list, findOne and listDocuments', async () => {
        const actor = actorOf(grant(Permission.STATE_READ), grant(Permission.AGENT_READ));
        const list = vi.spyOn(service, 'list');
        const findOne = vi.spyOn(service, 'findOne');
        const listDocuments = vi.spyOn(service, 'listDocuments');

        expect(await service.getMany('vault', QUERY, actor, scope)).toEqual([{ key: 'k', value: 2 }]);
        expect(await service.getOne('vault', 'k', actor, scope)).toBe(2);
        expect(await service.getDocuments('vault', 'notes', QUERY, actor, scope)).toEqual([{ id: 'n1', doc: { t: 'x' } }]);
        expect(list).toHaveBeenCalledTimes(1);
        expect(findOne).toHaveBeenCalledTimes(1);
        expect(listDocuments).toHaveBeenCalledTimes(1);
    });

    it('builds a query function only after the checks passed', async () => {
        const failing = () => {
            throw new Error('malformed query');
        };
        const reader = actorOf(grant(Permission.STATE_READ), grant(Permission.AGENT_READ));

        // 403 for the private agent, 404 for the undeclared collection: the function never runs
        await expect(service.getMany('vault', failing, actorOf(grant(Permission.STATE_READ)), scope)).rejects.toThrow('needs chamvi_agent_read');
        await expect(service.getDocuments('vault', 'none', failing, reader, scope)).rejects.toThrow('declares no state collection');

        await expect(service.getMany('vault', failing, reader, scope)).rejects.toThrow('malformed query');
        expect(await service.getDocuments('vault', 'notes', () => QUERY, reader, scope)).toEqual([{ id: 'n1', doc: { t: 'x' } }]);
    });

    it('refuses an invalid save body of a private agent with 403 before 400', async () => {
        const error = await errorOf(service.save('vault', 'k', 'x', actorOf(grant(Permission.STATE_WRITE)), scope));

        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toBe('State of agent "vault" needs chamvi_agent_read.');
    });

    it('refuses an invalid save body with 400 once readable', async () => {
        const actor = actorOf(grant(Permission.STATE_WRITE), grant(Permission.AGENT_READ));
        const set = vi.spyOn(service, 'set');

        await expect(service.save('vault', 'k', 'x', actor, scope)).rejects.toBeInstanceOf(BadRequestError);
        expect(set).not.toHaveBeenCalled();
    });

    it('saves the validated value under chamvi_state_write', async () => {
        const actor = actorOf(grant(Permission.STATE_WRITE));

        await expect(service.save('echo', 'k', { value: 3 }, actorOf(grant(Permission.STATE_READ)), scope))
            .rejects.toThrow('Missing permission "chamvi_state_write".');
        expect(await service.save('echo', 'k', { value: 3, extra: true }, actor, scope)).toBe(3);
        expect(await service.findOne('echo', 'k')).toBe(3);
    });

    it('answers an undeclared collection with 404', async () => {
        const actor = actorOf(grant(Permission.STATE_READ), grant(Permission.AGENT_READ));
        const listDocuments = vi.spyOn(service, 'listDocuments');
        const error = await errorOf(service.getDocuments('vault', 'none', QUERY, actor, scope));

        expect(error).toBeInstanceOf(NotFoundError);
        expect(error.message).toBe('Agent "vault" declares no state collection "none".');
        expect(listDocuments).not.toHaveBeenCalled();
    });
});
