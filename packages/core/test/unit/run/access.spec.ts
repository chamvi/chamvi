/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { HolderPermissionEvaluator, Permission } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';
import { RunStatus } from '@chamvi/core-kit';
import type { Run } from '@chamvi/core-kit';
import { ForbiddenError } from '@chamvi/errors';
import { MemoryRegistry, MemoryRunRepository } from '@chamvi/store-memory';
import { eq, inArray } from '@rapiq/core';
import type { IFilter, IFilters } from '@rapiq/core';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import type {
    ActorContext,
    Agent,
    IAgentRegistry,
    RunListInput,
} from '../../../src/index.ts';
import { RunNotFoundError, RunService, defineSimpleAgent } from '../../../src/index.ts';
import { ControllableClock } from '../../utils/clock.ts';

function uuid(label: string): string {
    const hex = Buffer.concat([Buffer.from(label), Buffer.alloc(16 - label.length)]).toString('hex');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function makeRun(id: string, agent: string): Run {
    const createdAt = new Date(1_000);

    return {
        id,
        agent,
        status: RunStatus.COMPLETED,
        trigger: {
            id: `t-${id}`,
            agent,
            trigger: 'http',
            channel: 'http',
            payload: {},
            receivedAt: createdAt,
        },
        usage: { inputTokens: 0, outputTokens: 0 },
        createdAt,
        updatedAt: createdAt,
    };
}

function agentOf(name: string, isPrivate = false): Agent {
    return defineSimpleAgent({
        name,
        run: () => undefined,
        ...(isPrivate ? { private: true } : {}),
    });
}

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

function conditionsOf(filters: IFilters): unknown[] {
    return filters.operator === 'and' ? [...filters.value] : [filters];
}

const ECHO = uuid('echo');
const VAULT = uuid('vault');
const scope = { agents: registryOf(agentOf('echo'), agentOf('vault', true)) };

const LIST: RunListInput = {
    filters: [],
    limit: 50,
    offset: 0,
    sorts: { createdAt: 'DESC' },
};

describe('RunService actor methods', () => {
    let service: RunService;

    beforeEach(async () => {
        const registry = new MemoryRegistry();

        service = new RunService({ repository: new MemoryRunRepository({ registry }), clock: new ControllableClock(0) });

        await service.create(makeRun(ECHO, 'echo'));
        await service.create(makeRun(VAULT, 'vault'));
    });

    describe('getOne', () => {
        it('reads the run with one findOneOrFail', async () => {
            const findOneOrFail = vi.spyOn(service, 'findOneOrFail');

            const run = await service.getOne(ECHO, actorOf(grant(Permission.RUN_READ)), scope);

            expect(run.id).toBe(ECHO);
            expect(findOneOrFail).toHaveBeenCalledTimes(1);
        });

        it('hides a private agent\'s run behind the unknown-run 404', async () => {
            await expect(service.getOne(VAULT, actorOf(grant(Permission.RUN_READ)), scope)).rejects.toBeInstanceOf(RunNotFoundError);
        });

        it('refuses a public agent\'s run with the 403 of chamvi_run_read', async () => {
            const actor = actorOf(restricted(Permission.RUN_READ, { agent: 'other' }));
            const error = await service.getOne(ECHO, actor, scope).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ForbiddenError);
            expect((error as Error).message).toBe('Missing permission "chamvi_run_read".');
        });

        it('hides a run behind the 404 when the registry holds no agent', async () => {
            const empty = { agents: registryOf() };

            await expect(service.getOne(ECHO, actorOf(grant(Permission.RUN_READ)), empty)).rejects.toBeInstanceOf(RunNotFoundError);
        });

        it('passes the 404 of a missing run', async () => {
            await expect(service.getOne(uuid('none'), actorOf(grant(Permission.AGENT_READ)), scope)).rejects.toBeInstanceOf(RunNotFoundError);
        });
    });

    describe('getMany', () => {
        it('limits an agent-scoped reader to its agents in one list query', async () => {
            const list = vi.spyOn(service, 'list');

            const { data, meta } = await service.getMany(LIST, actorOf(restricted(Permission.RUN_READ, { agent: 'echo' })), scope);

            expect(list).toHaveBeenCalledTimes(1);
            expect(conditionsOf(list.mock.calls[0]![0].filters)).toContainEqual(inArray('agent', ['echo']));
            expect(data.map((run) => run.id)).toEqual([ECHO]);
            expect(meta.total).toBe(1);
        });

        it('keeps the input filters next to the scope', async () => {
            const list = vi.spyOn(service, 'list');
            const filter: IFilter = eq('status', RunStatus.COMPLETED);

            await service.getMany({ ...LIST, filters: [filter] }, actorOf(restricted(Permission.RUN_READ, { agent: 'echo' })), scope);

            const conditions = conditionsOf(list.mock.calls[0]![0].filters);

            expect(conditions).toContainEqual(filter);
            expect(conditions).toContainEqual(inArray('agent', ['echo']));
        });

        it('adds no agent filter for an unrestricted chamvi_agent_read', async () => {
            const list = vi.spyOn(service, 'list');

            const { meta } = await service.getMany(LIST, actorOf(grant(Permission.AGENT_READ)), scope);

            expect(list).toHaveBeenCalledTimes(1);
            expect(conditionsOf(list.mock.calls[0]![0].filters)).toEqual([]);
            expect(meta.total).toBe(2);
        });

        it('limits a chamvi_agent_run-only holder to the public agents', async () => {
            const list = vi.spyOn(service, 'list');

            const { data } = await service.getMany(LIST, actorOf(grant(Permission.AGENT_RUN)), scope);

            expect(list).toHaveBeenCalledTimes(1);
            expect(conditionsOf(list.mock.calls[0]![0].filters)).toContainEqual(inArray('agent', ['echo']));
            expect(data.map((run) => run.id)).toEqual([ECHO]);
        });

        it('limits a restricted chamvi_agent_read to its agents', async () => {
            const list = vi.spyOn(service, 'list');

            const { data } = await service.getMany(LIST, actorOf(restricted(Permission.AGENT_READ, { name: 'vault' })), scope);

            expect(list).toHaveBeenCalledTimes(1);
            expect(conditionsOf(list.mock.calls[0]![0].filters)).toContainEqual(inArray('agent', ['vault']));
            expect(data.map((run) => run.id)).toEqual([VAULT]);
        });

        it('refuses a protected agent without its grant', async () => {
            const error = await service.getMany({ ...LIST, agent: 'vault' }, actorOf(grant(Permission.RUN_READ)), scope).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ForbiddenError);
            expect((error as Error).message).toBe('Reading runs of agent "vault" needs chamvi_agent_read.');
        });

        it('refuses a public agent with the 403 of chamvi_run_read', async () => {
            const actor = actorOf(restricted(Permission.RUN_READ, { agent: 'other' }));

            await expect(service.getMany({ ...LIST, agent: 'echo' }, actor, scope)).rejects.toThrow('Missing permission "chamvi_run_read".');
        });

        it('refuses an actor granted nothing', async () => {
            const list = vi.spyOn(service, 'list');
            const error = await service.getMany(LIST, actorOf(), scope).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ForbiddenError);
            expect((error as Error).message).toBe('Missing permission "chamvi_run_read".');
            expect(list).not.toHaveBeenCalled();
        });
    });

    describe('getCancelable', () => {
        it('checks chamvi_run_cancel before any store read', async () => {
            const findOne = vi.spyOn(service, 'findOne');

            await expect(service.getCancelable(ECHO, actorOf())).rejects.toThrow('Missing permission "chamvi_run_cancel".');
            expect(findOne).not.toHaveBeenCalled();
        });

        it('refuses a found run of another agent, returns undefined for a missing one', async () => {
            const actor = actorOf(restricted(Permission.RUN_CANCEL, { agent: 'other' }));
            const findOne = vi.spyOn(service, 'findOne');

            await expect(service.getCancelable(ECHO, actor)).rejects.toThrow('Missing permission "chamvi_run_cancel".');
            await expect(service.getCancelable(uuid('none'), actor)).resolves.toBeUndefined();
            expect(findOne).toHaveBeenCalledTimes(2);
        });

        it('returns the run for the grant of its agent', async () => {
            const run = await service.getCancelable(ECHO, actorOf(restricted(Permission.RUN_CANCEL, { agent: 'echo' })));

            expect(run?.id).toBe(ECHO);
        });
    });

    describe('getAnswerable', () => {
        it('returns the run for chamvi_agent_approve without any read grant', async () => {
            const findOneOrFail = vi.spyOn(service, 'findOneOrFail');
            const run = await service.getAnswerable(VAULT, actorOf(restricted(Permission.AGENT_APPROVE, { name: 'vault' })), scope);

            expect(run.id).toBe(VAULT);
            expect(findOneOrFail).toHaveBeenCalledTimes(1);
        });

        it('refuses without chamvi_agent_approve, 404 for a missing run', async () => {
            await expect(service.getAnswerable(ECHO, actorOf(grant(Permission.AGENT_READ)), scope))
                .rejects.toThrow('Missing permission "chamvi_agent_approve".');
            await expect(service.getAnswerable(uuid('none'), actorOf(grant(Permission.AGENT_APPROVE)), scope))
                .rejects.toBeInstanceOf(RunNotFoundError);
        });

        it('refuses a private agent\'s run to a grant restricted to public agents', async () => {
            const actor = actorOf(restricted(Permission.AGENT_APPROVE, { private: false }));
            const error = await service.getAnswerable(VAULT, actor, scope).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ForbiddenError);
            expect((error as Error).message).toBe('Missing permission "chamvi_agent_approve".');
            await expect(service.getAnswerable(ECHO, actor, scope)).resolves.toMatchObject({ id: ECHO });
        });
    });
});
