/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { V1PersistentVolumeClaim, V1Pod } from '@kubernetes/client-node';
import { ChamviError, SandboxError } from '@chamvi/core';
import {
    WORKSPACE_LABEL,
    probeImage,
    readWorkspaceInfo,
    resolveLimits,
} from '@chamvi/sandbox';
import type { IWorkspace, WorkspaceFindOptions, WorkspaceInfo } from '@chamvi/sandbox';
import { createPodTransport } from '../../transport/module.ts';
import { POD_NAME_PREFIX } from '../constants.ts';
import { buildPod, guard, podState } from '../helpers.ts';
import { K8S_PROVIDER_NAME } from '../workspaces/constants.ts';
import { isEnded } from '../workspaces/helpers.ts';
import type { KubernetesWorkspaces } from '../workspaces/module.ts';

/** The persistence side of the provider: the workspaces of claims, rebuilt pods and suspensions. */
export class KubernetesClaims {
    protected readonly ctx: KubernetesWorkspaces;

    constructor(ctx: KubernetesWorkspaces) {
        this.ctx = ctx;
    }

    /**
     * The workspace of claim `name` behind a new pod: the image and lifetime
     * from the claim, `activeDeadlineSeconds` what is left of it, env and
     * limits from the provider and `rebuild` (never from the claim), waits
     * like `create`. A pod that cannot start is a SandboxError (the pod this
     * call made deleted, the claim kept); undefined for a workspace without
     * its checkout record (the pod this call made deleted too).
     */
    async rebuildPod(
        id: string,
        info: WorkspaceInfo,
        deployment: string,
        findOptions: WorkspaceFindOptions,
    ): Promise<IWorkspace | undefined> {
        const { ctx } = this;
        const name = `${POD_NAME_PREFIX}${id}`;
        const started = ctx.clock.now();
        const remaining = Math.max(1, Math.ceil((info.expiresAt.getTime() - started) / 1000));
        const pod = buildPod({
            id,
            deployment,
            namespace: ctx.namespace,
            info: { ...info, image: info.image ?? ctx.image },
            env: { ...ctx.options.env, ...findOptions.rebuild?.env },
            limits: resolveLimits(ctx.options.limits, findOptions.rebuild?.limits),
            labels: ctx.options.podLabels ?? {},
            imagePullPolicy: ctx.imagePullPolicy,
            user: ctx.user,
            readOnlyRoot: ctx.readOnlyRoot,
            ...(ctx.options.cache && { cacheClaim: ctx.options.cache.claimName }),
            claim: name,
            tmpSize: ctx.tmpSize,
            activeDeadlineSeconds: remaining,
        });
        let created = false;

        try {
            created = await ctx.createOrJoin(pod, started, findOptions.signal);
            await ctx.waitForRunning(name, findOptions.signal, started);
            await probeImage(createPodTransport(ctx.client, name), {
                image: pod.spec!.containers[0]!.image!,
                clock: ctx.clock,
                signal: findOptions.signal,
            });
        } catch (error) {
            if (created) {
                // only the pod: the claim holds the run's files
                await ctx.client.delete(name).catch(() => undefined);
            }

            if (error instanceof ChamviError) {
                throw error;
            }

            throw new SandboxError(`cannot rebuild workspace pod ${name}`, { cause: error });
        }

        // a read failure throws (the claim holds the run's files, never "not found")
        const found = await ctx.openFound(id, info, findOptions.signal, true);

        if (!found && created) {
            // an orphan claim (its create died before the checkout record): no
            // compute left running, the claim goes at settle or expiry
            await ctx.client.delete(name).catch(() => undefined);
        }

        return found;
    }

    /**
     * The workspace of a run's claim (persistence): the held handle while its
     * pod runs (or its create here is still in flight), else one opened on
     * the running pod, else the pod rebuilt; a failed or finished pod is
     * deleted first (with `restore: false` a handle on the claim, only to
     * dispose, its checkout never read). A suspension of it in flight here
     * is waited out first. Undefined for an expired, deleting or foreign
     * claim and for one without its checkout record (an orphan); a checkout
     * that cannot be read is a SandboxError (the claim kept), unless the pod
     * turned out gone meanwhile: then the pod is rebuilt once.
     */
    async findClaimed(
        claim: V1PersistentVolumeClaim,
        listed: V1Pod | undefined,
        runId: string,
        deployment: string,
        findOptions: WorkspaceFindOptions,
    ): Promise<IWorkspace | undefined> {
        const { ctx } = this;
        let pod = listed;
        const id = claim.metadata?.labels?.[WORKSPACE_LABEL] ?? '';
        const held = ctx.live.get(id);

        if ((held && ctx.disposing.has(held)) || ctx.removing.has(id)) {
            return undefined;
        }

        // a claim being deleted (pvc-protection holds it while its pod goes) was disposed
        if (claim.metadata?.deletionTimestamp) {
            return undefined;
        }

        const info = readWorkspaceInfo({ ...claim.metadata?.annotations, ...claim.metadata?.labels }, K8S_PROVIDER_NAME);

        if (!info || info.runId !== runId || info.expiresAt.getTime() <= ctx.clock.now()) {
            return undefined;
        }

        const suspension = ctx.suspensions.get(id);

        if (suspension) {
            // the listed pod is going: decide on what is left once its delete settled
            await suspension;
            pod = await guard(`read workspace pod ${claim.metadata?.name}`, () => ctx.readPod(claim.metadata!.name!));
        }

        const running = pod !== undefined && !isEnded(pod) && podState(pod).state === 'running';

        if (held && !held.disposed && (running || ctx.creating.has(id))) {
            return held;
        }

        if (ctx.creating.has(id)) {
            return undefined;
        }

        if (held) {
            // gone (suspended elsewhere, evicted): forgotten, never disposed
            ctx.live.delete(id);
        }

        if (findOptions.restore === false) {
            // a lookup to remove it: no checkout read, no pod scheduled, the handle's dispose
            // deletes pod and claim; never held, so a restoring find opens it properly
            return ctx.open(id, info, undefined, true);
        }

        if (running) {
            try {
                return await ctx.openFound(id, info, findOptions.signal, true);
            } catch (error) {
                // suspended (or evicted) between the list and the read: rebuilt once below
                const now = await guard(`read workspace pod ${claim.metadata?.name}`, () => ctx.readPod(claim.metadata!.name!));

                if (now && !isEnded(now)) {
                    throw error;
                }

                pod = now;
            }
        }

        if (pod && !pod.metadata?.deletionTimestamp && podState(pod).state === 'failed') {
            await guard(`delete workspace pod ${pod.metadata?.name}`, () => ctx.client.delete(pod.metadata!.name!));
        }

        return this.rebuildPod(id, info, deployment, findOptions);
    }

    /**
     * Deletes the pod of a suspendable run (`answer` true) and keeps its
     * claim, after dropping its held handle (never disposed), so the next
     * `find` rebuilds it; a SandboxError for a rejected `isSuspendable` or a
     * failed delete (the pod keeps running).
     */
    async suspend(name: string, labels: Record<string, string>, answer: boolean | SandboxError): Promise<unknown> {
        const { ctx } = this;

        if (answer !== true) {
            return answer === false ? undefined : answer;
        }

        const id = labels[WORKSPACE_LABEL] ?? '';
        const held = ctx.live.get(id);

        // one being disposed is removed, one being created is not yet the run's to lose
        if ((held && ctx.disposing.has(held)) || ctx.removing.has(id) || ctx.creating.has(id)) {
            return undefined;
        }

        ctx.live.delete(id);

        const deleting = guard(`suspend workspace pod ${name}`, () => ctx.client.delete(name)).then(() => undefined, (error: unknown) => error);

        ctx.suspensions.set(id, deleting);

        try {
            return await deleting;
        } finally {
            if (ctx.suspensions.get(id) === deleting) {
                ctx.suspensions.delete(id);
            }
        }
    }
}
