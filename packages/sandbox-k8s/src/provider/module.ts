/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import type { V1PersistentVolumeClaim, V1Pod } from '@kubernetes/client-node';
import { ChamviError, ValidationError } from '@chamvi/errors';
import { SandboxError } from '@chamvi/core';
import {
    DEPLOYMENT_LABEL,
    RUN_LABEL,
    WORKSPACE_LABEL,
    abortedCreate,
    assertCreateInput,
    assertDeployment,
    buildWorkspaceInfo,
    collectionError,
    createSettledCheck,
    createSuspendableCheck,
    prepareWorkspace,
    probeImage,
    readWorkspaceInfo,
    resolveLimits,
} from '@chamvi/sandbox';
import type { ISandboxProvider, IWorkspace } from '@chamvi/sandbox';
import { KubernetesClaims } from './claims/module.ts';
import { POD_NAME_PREFIX } from './constants.ts';
import {
    assertKubernetesOptions,
    buildClaim,
    buildPod,
    guard,
    isExpired,
    isLabelValue,
    podState,
} from './helpers.ts';
import type { KubernetesSandboxOptions } from './types.ts';
import { K8S_MANAGED_SELECTOR, K8S_PROVIDER_NAME } from './workspaces/constants.ts';
import { KubernetesWorkspaces } from './workspaces/module.ts';

/**
 * One pod per workspace (see `buildPod`: root with a writable root and a few
 * capabilities by default, the hardened mode through `user` and
 * `readOnlyRoot`), commands run through the pod exec API inside GNU
 * `timeout`. `create` waits for the pod to run (polling its status on the
 * clock, failing fast on image and config errors), probes the image
 * (`probeImage`), then checks out. With `persistence` each workspace gets
 * a claim of its own (`buildClaim`, made before the pod, deleted with it on
 * dispose and by the collection once expired or settled). `find` lists a run's running pods by label and rebuilds
 * the info from their labels and annotations; a pod that failed, finished
 * or is being deleted is gone. With `persistence` the collection suspends
 * the running pod of a suspendable run by deleting it (the claim stays, its
 * held handle is dropped, never disposed), and `find` rebuilds the pod of a
 * live claim without a running one (`rebuild`). Creating the provider
 * contacts nothing.
 */
export function createKubernetesSandbox(options: KubernetesSandboxOptions): ISandboxProvider {
    assertKubernetesOptions(options);

    const ctx = new KubernetesWorkspaces(options);
    const claimWorkspaces = new KubernetesClaims(ctx);
    const {
        namespace,
        client,
        image,
        imagePullPolicy,
        user,
        readOnlyRoot,
        tmpSize,
        clock,
        persistence,
        live,
        creating,
    } = ctx;

    return {
        name: K8S_PROVIDER_NAME,

        async create(input) {
            assertCreateInput(input, { image: true });

            if (!isLabelValue(input.runId)) {
                throw new ValidationError('runId must be a Kubernetes label value (at most 63 alphanumerics, `-`, `_` or `.`, starting and ending alphanumeric).');
            }

            if (input.signal?.aborted) {
                throw abortedCreate();
            }

            const deployment = assertDeployment(input.deployment);
            const limits = resolveLimits(options.limits, input.limits);

            const id = randomUUID();
            const name = `${POD_NAME_PREFIX}${id}`;
            const info = {
                ...buildWorkspaceInfo(input, K8S_PROVIDER_NAME, new Date(clock.now()), limits.maxLifetimeMs),
                image: input.image ?? image,
            };
            const transport = ctx.transportOf(name);
            const workspace = ctx.open(id, info, transport);

            creating.add(id);

            try {
                if (persistence) {
                    // before the pod, which mounts it; a claim still Pending (WaitForFirstConsumer) binds with the pod
                    await guard(`create workspace claim ${name}`, () => client.createClaim!(buildClaim({
                        id,
                        deployment,
                        namespace,
                        info,
                        size: persistence.size ?? limits.storage,
                        ...(persistence.storageClassName !== undefined && { storageClassName: persistence.storageClassName }),
                    })));
                }

                await client.create(buildPod({
                    id,
                    deployment,
                    namespace,
                    info,
                    env: { ...options.env, ...input.env },
                    limits,
                    labels: options.podLabels ?? {},
                    // the operator's policy for every image, requested or default
                    imagePullPolicy,
                    user,
                    readOnlyRoot,
                    ...(options.cache && { cacheClaim: options.cache.claimName }),
                    ...(persistence && { claim: name }),
                    tmpSize,
                }));
                await ctx.waitForRunning(name, input.signal);
                await probeImage(transport, {
                    image: info.image,
                    clock,
                    signal: input.signal,
                });
                // the commit and the default branch, each only when known
                Object.assign(info, await prepareWorkspace(workspace, {
                    ...input.checkout,
                    repo: input.repo,
                    ref: input.ref,
                    signal: input.signal,
                }));
            } catch (error) {
                // deleting a pod or claim that was never created is a 404, which is fine
                await workspace.dispose().catch(() => undefined);

                if (error instanceof ChamviError) {
                    throw error;
                }

                throw new SandboxError(`cannot start workspace pod ${name}`, { cause: error });
            } finally {
                creating.delete(id);
            }

            return workspace;
        },

        async find(runId, findOptions = {}) {
            const deployment = assertDeployment(findOptions.deployment);

            // no pod can carry a run label that is no label value
            if (!isLabelValue(runId)) {
                return [];
            }

            const selector = `${K8S_MANAGED_SELECTOR},${DEPLOYMENT_LABEL}=${deployment},${RUN_LABEL}=${runId}`;
            const pods = await guard('list the workspace pods', () => client.list(selector));
            const claims = persistence ?
                await guard('list the workspace claims', () => client.listClaims!(selector)) :
                [];
            const now = clock.now();
            const found: IWorkspace[] = [];
            const claimed = new Set<string>();

            // a claim's workspace comes back even without a running pod; a failed rebuild throws, never skips it
            for (const claim of claims) {
                const name = claim.metadata?.name ?? '';
                const workspace = await claimWorkspaces.findClaimed(
                    claim,
                    pods.find((pod) => pod.metadata?.name === name),
                    runId,
                    deployment,
                    findOptions,
                );

                claimed.add(name);

                if (workspace) {
                    found.push(workspace);
                }
            }

            for (const pod of pods) {
                if (claimed.has(pod.metadata?.name ?? '')) {
                    continue;
                }

                const labels = pod.metadata?.labels ?? {};
                const id = labels[WORKSPACE_LABEL] ?? '';
                const held = live.get(id);

                if (held) {
                    if (!held.disposed && held.info.expiresAt.getTime() > now) {
                        found.push(held);
                    }

                    continue;
                }

                if (pod.metadata?.deletionTimestamp || podState(pod).state !== 'running') {
                    continue;
                }

                const info = readWorkspaceInfo({ ...pod.metadata?.annotations, ...labels }, K8S_PROVIDER_NAME);

                if (!info || info.runId !== runId || info.expiresAt.getTime() <= now) {
                    continue;
                }

                const workspace = await ctx.openFound(id, info, findOptions.signal);

                if (workspace) {
                    found.push(workspace);
                }
            }

            return found;
        },

        async collectGarbage(gcOptions = {}) {
            const deployment = assertDeployment(gcOptions.deployment);
            const selector = `${K8S_MANAGED_SELECTOR},${DEPLOYMENT_LABEL}=${deployment}`;
            const pods = await guard('list the workspace pods', () => client.list(selector));
            const claims = persistence ?
                await guard('list the workspace claims', () => client.listClaims!(selector)) :
                [];
            const now = clock.now();
            let count = 0;
            // one workspace that cannot go never keeps the others
            const failures: unknown[] = [];
            const isSettled = createSettledCheck(gcOptions.isSettled);
            const isSuspendable = createSuspendableCheck(gcOptions.isSuspendable);
            // a pod and its claim share the name: one decision per workspace
            const workspaces = new Map<string, { pod?: V1Pod; claim?: V1PersistentVolumeClaim }>();

            for (const pod of pods) {
                const name = pod.metadata?.name;

                if (name) {
                    workspaces.set(name, { pod });
                }
            }

            for (const claim of claims) {
                const name = claim.metadata?.name;

                if (name) {
                    workspaces.set(name, { ...workspaces.get(name), claim });
                }
            }

            for (const [name, { pod, claim }] of workspaces) {
                const metadata = (pod ?? claim)?.metadata;
                const phase = pod?.status?.phase;
                const finished = phase === 'Failed' || phase === 'Succeeded';
                // expired or settled: the whole workspace goes, claim included
                let settled = isExpired({ metadata }, now);

                // a finished pod without a claim goes anyway; one with a claim keeps the claim unless its run settled
                if (!settled && (claim || !finished)) {
                    const answer = await isSettled(metadata?.labels?.[RUN_LABEL] ?? '');

                    if (answer instanceof SandboxError) {
                        failures.push(answer);
                    }

                    settled = answer === true;
                }

                if (!settled && !(pod && finished)) {
                    // only a running pod whose files outlive it on its claim
                    if (pod && claim && podState(pod).state === 'running' && !pod.metadata?.deletionTimestamp) {
                        const failure = await claimWorkspaces.suspend(name, metadata?.labels ?? {}, await isSuspendable(metadata?.labels?.[RUN_LABEL] ?? ''));

                        if (failure) {
                            failures.push(failure);
                        }
                    }

                    continue;
                }

                // one open here is disposed, so its in-flight commands settle too
                const workspace = live.get(metadata?.labels?.[WORKSPACE_LABEL] ?? '');

                try {
                    if (workspace && (settled || !claim)) {
                        // with persistence its removal deletes the claim too
                        await guard(`delete workspace pod ${name}`, () => workspace.dispose());
                    } else {
                        if (pod) {
                            await guard(`delete workspace pod ${name}`, () => client.delete(name));
                        }

                        if (claim && settled) {
                            await ctx.deleteClaim(name);
                        }
                    }
                } catch (error) {
                    failures.push(error);

                    continue;
                }

                count++;
            }

            if (failures.length > 0) {
                throw collectionError(count, failures);
            }

            return count;
        },
    };
}
