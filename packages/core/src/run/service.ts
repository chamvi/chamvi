/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import { EntityConflictError, EntityRelationError, ForbiddenError } from '@chamvi/errors';
import {
    and,
    defineQuery,
    eq,
    inArray,
    ne,
} from '@rapiq/core';
import type { ICondition, IQuery } from '@rapiq/core';
import type { EntityFindManyResult, IRunRepository } from '@chamvi/store';
import type { Run } from '@chamvi/core-kit';
import { forbidden } from '../actor/helpers.ts';
import type { ActorContext } from '../actor/types.ts';
import type { IClock } from '../clock/index.ts';
import {
    InvalidRunStateError,
    RepositoryNotFoundError,
    RunNotFoundError,
} from '../errors/index.ts';
import {
    agentResource,
    canReadAgentContent,
    isAgentContentProtected,
    readableAgents,
} from '../permission/agent.ts';
import type { AgentScope } from '../permission/types.ts';
import { AbstractEntityService } from '../service/module.ts';
import {
    readRun,
    splitWaitKind,
    waitIdOf,
    withIdTieBreak,
} from './helpers.ts';
import type {
    IRunService,
    RunFindOptions,
    RunListInput,
    RunServiceContext,
    RunUpdateOptions,
} from './types.ts';

/** The grants that read some agent's runs: any one of them opens the listing. */
const RUN_LISTING_PERMISSIONS = [Permission.RUN_READ, Permission.AGENT_READ, Permission.AGENT_RUN] as const;

/**
 * The rules of runs over an `IRunRepository`: lineage from the envelope,
 * the update guards and `updatedAt`, the claim lease (expired at exactly
 * `expiresAt`), the read normalization and the list queries. Each change
 * reads the row locked in one transaction and reads the clock after the
 * lock is held. The `get*` methods load runs for an actor and check its
 * permissions first.
 */
export class RunService extends AbstractEntityService implements IRunService {
    protected repository: IRunRepository;

    protected clock: IClock;

    constructor(ctx: RunServiceContext) {
        super();
        this.repository = ctx.repository;
        this.clock = ctx.clock;
    }

    async create(run: Run): Promise<boolean> {
        // a peer parent names a run of another app: no local lineage
        const parentRunId = run.trigger.parent?.kind === 'dispatch' ? run.trigger.parent.runId : undefined;
        const value: Run = { ...run };

        delete value.parentRunId;

        if (parentRunId !== undefined) {
            value.parentRunId = parentRunId;
        }

        try {
            await this.repository.transaction(async (repository) => {
                await repository.save(repository.create(value));
            });
        } catch (error) {
            // the failed transaction rolled back; the stored run stays as it is
            if (error instanceof EntityConflictError) {
                return false;
            }

            if (error instanceof EntityRelationError && error.relation === 'run' && parentRunId !== undefined) {
                throw new RunNotFoundError(parentRunId);
            }

            throw error;
        }

        return true;
    }

    async findOne(id: string): Promise<Run | undefined> {
        const run = await this.repository.findOneById(id);

        return run ? readRun(run) : undefined;
    }

    async findOneOrFail(id: string): Promise<Run> {
        const run = await this.findOne(id);

        if (!run) {
            throw new RunNotFoundError(id);
        }

        return run;
    }

    async update(id: string, patch: Partial<Run>, expect: RunUpdateOptions = {}): Promise<Run> {
        return this.updateWith(id, () => patch, expect);
    }

    async updateWith(id: string, derive: (run: Run) => Partial<Run>, expect: RunUpdateOptions = {}): Promise<Run> {
        return this.repository.transaction(async (repository) => {
            const run = await repository.findOneById(id);

            if (!run) {
                throw new RunNotFoundError(id);
            }

            if (expect.expectStatus && !expect.expectStatus.includes(run.status)) {
                throw new InvalidRunStateError(
                    `Run "${id}" is "${run.status}", expected one of: ${expect.expectStatus.join(', ')}.`,
                );
            }

            if (expect.expectOwner !== undefined && run.claim?.owner !== expect.expectOwner) {
                throw new InvalidRunStateError(
                    `Run "${id}" is not claimed by "${expect.expectOwner}" (claim: ${run.claim?.owner ?? 'none'}).`,
                );
            }

            if (expect.expectWaitId !== undefined && waitIdOf(run.waiting) !== expect.expectWaitId) {
                throw new InvalidRunStateError(
                    `Run "${id}" does not wait on "${expect.expectWaitId}" (wait: ${waitIdOf(run.waiting) ?? 'none'}).`,
                );
            }

            const { parentRunId, updatedAt } = run;
            // derived from the locked row: a field the patch keeps is never written back stale
            const patch = derive(readRun(structuredClone(run)));

            repository.merge(run, {
                ...patch,
                id,
                updatedAt: patch.updatedAt ?? (expect.keepUpdatedAt ? updatedAt : new Date(this.clock.now())),
            });

            // lineage is fixed at insert: a patch never moves a run to another parent
            if (parentRunId === undefined) {
                delete run.parentRunId;
            } else {
                run.parentRunId = parentRunId;
            }

            return readRun(await repository.save(run));
        });
    }

    async find(options: RunFindOptions = {}): Promise<{ data: Run[]; total: number }> {
        const filters: ICondition[] = [];
        const agents = options.agent === undefined ?
            options.agents :
            [options.agent].filter((agent) => options.agents?.includes(agent) ?? true);
        const parents = options.parentRunId === undefined ?
            options.parentRunIds :
            [options.parentRunId].filter((id) => options.parentRunIds?.includes(id) ?? true);

        if (
            (agents !== undefined && agents.length === 0) ||
            (parents !== undefined && (parents.length === 0 || options.hasParent === false))
        ) {
            // no agent or parent left to match, or a parent run and none
            return { data: [], total: 0 };
        }

        if (agents !== undefined) {
            filters.push(inArray('agent', [...agents]));
        }

        if (options.status !== undefined) {
            filters.push(inArray('status', [...options.status]));
        }

        if (options.concurrencyKey !== undefined) {
            filters.push(eq('concurrencyKey', options.concurrencyKey));
        }

        if (options.ids !== undefined) {
            filters.push(inArray('id', [...options.ids]));
        }

        if (parents !== undefined) {
            filters.push(inArray('parentRunId', [...parents]));
        } else if (options.hasParent !== undefined) {
            filters.push(options.hasParent ? ne('parentRunId', null) : eq('parentRunId', null));
        }

        const direction = options.order === 'desc' ? 'DESC' : 'ASC';
        const query = defineQuery({
            ...(filters.length > 0 ? { filters: and(...filters) } : {}),
            sorts: { createdAt: direction, id: direction },
            pagination: {
                ...(options.limit !== undefined ? { limit: options.limit } : {}),
                ...(options.offset !== undefined ? { offset: options.offset } : {}),
            },
        });
        const { data, meta } = options.waitKind === undefined ?
            await this.repository.findMany(query) :
            await this.repository.findByWaitKind(options.waitKind, query);

        return { data: data.map((run) => readRun(run)), total: meta.total };
    }

    async findOrFail(options: RunFindOptions = {}): Promise<{ data: Run[]; total: number }> {
        const result = await this.find(options);

        if (result.data.length === 0) {
            throw new RepositoryNotFoundError('runs');
        }

        return result;
    }

    async list(query: IQuery): Promise<EntityFindManyResult<Run>> {
        const { conditions, waitKind } = splitWaitKind(query.filters);
        const listed = defineQuery({
            fields: query.fields,
            relations: query.relations,
            ...(conditions.length > 0 ? { filters: and(...conditions) } : {}),
            sorts: withIdTieBreak(query.sorts.value),
            pagination: query.pagination,
        });
        const { data, meta } = waitKind === undefined ?
            await this.repository.findMany(listed) :
            await this.repository.findByWaitKind(waitKind, listed);

        return { data: data.map((run) => readRun(run)), meta };
    }

    async claim(id: string, owner: string, ttlMs: number): Promise<boolean> {
        return this.repository.transaction(async (repository) => {
            const run = await repository.findOneById(id);

            if (!run) {
                return false;
            }

            // after the row lock: a lease another claim just wrote is compared with a fresh time
            const now = this.clock.now();

            if (run.claim && run.claim.expiresAt.getTime() > now) {
                return false;
            }

            repository.merge(run, { claim: { owner, expiresAt: new Date(now + ttlMs) } });
            await repository.save(run);

            return true;
        });
    }

    async renewClaim(id: string, owner: string, ttlMs: number): Promise<boolean> {
        return this.repository.transaction(async (repository) => {
            const run = await repository.findOneById(id);

            if (!run) {
                return false;
            }

            const now = this.clock.now();

            if (!run.claim || run.claim.owner !== owner || run.claim.expiresAt.getTime() <= now) {
                return false;
            }

            repository.merge(run, { claim: { owner, expiresAt: new Date(now + ttlMs) } });
            await repository.save(run);

            return true;
        });
    }

    async getOne(id: string, actor: ActorContext, options: AgentScope): Promise<Run> {
        const run = await this.findOneOrFail(id);

        if (await canReadAgentContent(actor, run.agent, options.agents)) {
            return run;
        }

        // the unknown-run 404 for a protected run, so run ids are not probed
        if (isAgentContentProtected(run.agent, options.agents)) {
            throw new RunNotFoundError(id);
        }

        throw forbidden(Permission.RUN_READ);
    }

    async getMany(input: RunListInput, actor: ActorContext, options: AgentScope): Promise<EntityFindManyResult<Run>> {
        const agents = await this.listableAgents(input.agent, actor, options);
        const filters = agents === undefined ? input.filters : [...input.filters, inArray('agent', [...agents])];

        // one query with the scope joined in, so `total` and the page stay exact
        return this.list(defineQuery({
            ...(filters.length > 0 ? { filters: and(...filters) } : {}),
            sorts: input.sorts,
            pagination: { limit: input.limit, offset: input.offset },
        }));
    }

    async getCancelable(id: string, actor: ActorContext): Promise<Run | undefined> {
        await this.assertGranted(actor, Permission.RUN_CANCEL);

        const run = await this.findOne(id);

        if (run && !await this.isGranted(actor, Permission.RUN_CANCEL, { agent: run.agent })) {
            throw forbidden(Permission.RUN_CANCEL);
        }

        return run;
    }

    async getAnswerable(id: string, actor: ActorContext, options: AgentScope): Promise<Run> {
        const run = await this.findOneOrFail(id);

        if (!await this.isGranted(actor, Permission.AGENT_APPROVE, agentResource(run.agent, options.agents.get(run.agent)))) {
            throw forbidden(Permission.AGENT_APPROVE);
        }

        return run;
    }

    /**
     * The `agent` filter a listing needs (`undefined`: none), else 403.
     * With `agent`, the actor must read that agent's runs. Without, an
     * unrestricted `chamvi_agent_read` reads every run; an actor holding
     * `chamvi_run_read`, `chamvi_agent_read` or `chamvi_agent_run` for some
     * resource gets the agents it may read.
     */
    protected async listableAgents(agent: string | undefined, actor: ActorContext, options: AgentScope): Promise<readonly string[] | undefined> {
        if (agent !== undefined) {
            if (await canReadAgentContent(actor, agent, options.agents)) {
                return undefined;
            }

            if (isAgentContentProtected(agent, options.agents)) {
                throw new ForbiddenError({ message: `Reading runs of agent "${agent}" needs ${Permission.AGENT_READ}.` });
            }

            throw forbidden(Permission.RUN_READ);
        }

        if (await this.isGranted(actor, Permission.AGENT_READ)) {
            return undefined;
        }

        for (const permission of RUN_LISTING_PERMISSIONS) {
            if (await this.isGrantedSome(actor, permission)) {
                return readableAgents(actor, options.agents);
            }
        }

        throw forbidden(Permission.RUN_READ);
    }
}
