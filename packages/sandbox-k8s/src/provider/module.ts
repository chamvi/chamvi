/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import type { V1PersistentVolumeClaim, V1Pod } from '@kubernetes/client-node';
import {
    ChamviError,
    SandboxError,
    ValidationError,
    systemClock,
} from '@chamvi/core';
import {
    DEFAULT_SANDBOX_IMAGE,
    DEPLOYMENT_LABEL,
    RUN_LABEL,
    SANDBOX_LABEL_SELECTORS,
    TMP_SIZE,
    WORKSPACE_LABEL,
    abortedCreate,
    assertCreateInput,
    assertDeployment,
    buildWorkspaceInfo,
    collectionError,
    createRemoteWorkspace,
    createSettledCheck,
    createSuspendableCheck,
    delay,
    prepareWorkspace,
    probeImage,
    readCheckout,
    readWorkspaceInfo,
    resolveLimits,
} from '@chamvi/sandbox';
import type {
    IExecTransport,
    ISandboxProvider,
    IWorkspace,
    WorkspaceFindOptions,
    WorkspaceInfo,
} from '@chamvi/sandbox';
import { isObject } from 'smob';
import { isApiStatus } from '../client/helpers.ts';
import { createPodClient } from '../client/module.ts';
import { createPodTransport } from '../transport/module.ts';
import {
    POD_NAME_PREFIX,
    POLL_MS,
    START_TIMEOUT_MS,
} from './constants.ts';
import {
    assertKubernetesOptions,
    buildClaim,
    buildPod,
    guard,
    isExpired,
    isLabelValue,
    loadDefaultKubeConfig,
    podState,
} from './helpers.ts';
import type { KubernetesSandboxOptions } from './types.ts';

const PROVIDER_NAME = 'k8s';

const MANAGED_SELECTOR = SANDBOX_LABEL_SELECTORS.join(',');

/** True for a client error of HTTP status `code`, the ApiException itself or as the cause. */
function isStatus(error: unknown, code: number): boolean {
    return isApiStatus(error, code) || (isObject(error) && isApiStatus(error.cause, code));
}

/** True for a pod that is gone or going: being deleted, failed or finished. */
function isEnded(pod: V1Pod): boolean {
    return Boolean(pod.metadata?.deletionTimestamp) || podState(pod).state === 'failed';
}

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

    const { namespace } = options;
    const client = options.client ?? createPodClient({
        kubeConfig: options.kubeConfig ?? loadDefaultKubeConfig(),
        namespace,
    });
    const image = options.image ?? DEFAULT_SANDBOX_IMAGE;
    const imagePullPolicy = options.imagePullPolicy ?? 'IfNotPresent';
    const user = options.user ?? { uid: 0, gid: 0 };
    const readOnlyRoot = options.readOnlyRoot ?? false;
    const tmpSize = options.tmpSize ?? TMP_SIZE;
    const startTimeoutMs = options.startTimeoutMs ?? START_TIMEOUT_MS;
    const pollMs = options.pollMs ?? POLL_MS;
    const clock = options.clock ?? systemClock;
    const { persistence } = options;
    const live = new Map<string, IWorkspace>();
    // handles whose dispose was called: never answered, rebuilt or suspended
    const disposing = new WeakSet<IWorkspace>();
    // ids of the creates in flight here: their claim may exist before the pod
    const creating = new Set<string>();

    /** Deletes claim `name` (missing is fine); only called with `persistence`, whose check found the method. */
    function deleteClaim(name: string): Promise<void> {
        return guard(`delete workspace claim ${name}`, () => client.deleteClaim!(name));
    }

    /** The pod's transport; with `persistence` its removal deletes the claim of the same name after the pod. */
    function transportOf(name: string): IExecTransport {
        const transport = createPodTransport(client, name);

        if (!persistence) {
            return transport;
        }

        return {
            ...transport,
            async remove() {
                await transport.remove();
                await deleteClaim(name);
            },
        };
    }

    /** Resolves once the pod runs; SandboxError when it never will, takes too long or the signal fires. */
    async function waitForRunning(name: string, signal?: AbortSignal, started = clock.now().getTime()): Promise<void> {
        for (;;) {
            if (signal?.aborted) {
                throw abortedCreate();
            }

            const state = podState(await client.read(name));

            if (state.state === 'running') {
                return;
            }

            if (state.state === 'failed') {
                throw new SandboxError(`workspace pod ${name} cannot start: ${state.reason}`);
            }

            const remaining = started + startTimeoutMs - clock.now().getTime();

            if (remaining <= 0) {
                throw new SandboxError(`workspace pod ${name} did not start within ${startTimeoutMs} ms.`);
            }

            await delay(clock, Math.min(pollMs, remaining), signal, () => abortedCreate());
        }
    }

    /** The workspace of pod `chamvi-ws-<id>`, registered as live until disposed. */
    function open(id: string, info: WorkspaceInfo, transport: IExecTransport = transportOf(`${POD_NAME_PREFIX}${id}`)): IWorkspace {
        const remote = createRemoteWorkspace({
            id,
            info,
            transport,
            clock,
        });
        const workspace: IWorkspace = {
            id,
            info,
            get disposed() {
                return remote.disposed;
            },
            exec: remote.exec,
            readFile: remote.readFile,
            readBytes: remote.readBytes,
            writeFile: remote.writeFile,
            async dispose() {
                disposing.add(workspace);
                await remote.dispose();

                // a handle dropped by a suspension never unregisters the fresh one
                if (live.get(id) === workspace) {
                    live.delete(id);
                }
            },
        };

        live.set(id, workspace);

        return workspace;
    }

    /**
     * Creates pod `pod`, or joins one of the same name another `find` (here
     * or on another replica) created first (a 409 for a pod not being
     * deleted); a pod still being deleted is waited out up to the start
     * timeout. True when this call created it.
     */
    async function createOrJoin(pod: V1Pod, started: number, signal?: AbortSignal): Promise<boolean> {
        const name = pod.metadata!.name!;

        for (;;) {
            if (signal?.aborted) {
                throw abortedCreate();
            }

            try {
                await client.create(pod);

                return true;
            } catch (error) {
                if (!isStatus(error, 409)) {
                    throw error;
                }
            }

            let existing: V1Pod | undefined;

            try {
                existing = await client.read(name);
            } catch (error) {
                if (!isStatus(error, 404)) {
                    throw error;
                }
            }

            if (existing && !existing.metadata?.deletionTimestamp) {
                return false;
            }

            const remaining = started + startTimeoutMs - clock.now().getTime();

            if (remaining <= 0) {
                throw new SandboxError(`workspace pod ${name} was still being deleted after ${startTimeoutMs} ms.`);
            }

            await delay(clock, Math.min(pollMs, remaining), signal, () => abortedCreate());
        }
    }

    /**
     * The workspace of claim `name` behind a new pod: the image and lifetime
     * from the claim, `activeDeadlineSeconds` what is left of it, env and
     * limits from the provider and `rebuild` (never from the claim), waits
     * like `create`. A pod that cannot start is a SandboxError (the pod this
     * call made deleted, the claim kept); undefined for a workspace without
     * its checkout record.
     */
    async function rebuildPod(
        id: string,
        info: WorkspaceInfo,
        deployment: string,
        findOptions: WorkspaceFindOptions,
    ): Promise<IWorkspace | undefined> {
        const name = `${POD_NAME_PREFIX}${id}`;
        const started = clock.now().getTime();
        const remaining = Math.max(1, Math.ceil((info.expiresAt.getTime() - started) / 1000));
        const pod = buildPod({
            id,
            deployment,
            namespace,
            info: { ...info, image: info.image ?? image },
            env: { ...options.env, ...findOptions.rebuild?.env },
            limits: resolveLimits(options.limits, findOptions.rebuild?.limits),
            labels: options.podLabels ?? {},
            imagePullPolicy,
            user,
            readOnlyRoot,
            ...(options.cache && { cacheClaim: options.cache.claimName }),
            claim: name,
            tmpSize,
            activeDeadlineSeconds: remaining,
        });
        let created = false;

        try {
            created = await createOrJoin(pod, started, findOptions.signal);
            await waitForRunning(name, findOptions.signal, started);
            await probeImage(createPodTransport(client, name), {
                image: pod.spec!.containers[0]!.image!,
                clock,
                signal: findOptions.signal,
            });
        } catch (error) {
            if (created) {
                // only the pod: the claim holds the run's files
                await client.delete(name).catch(() => undefined);
            }

            if (error instanceof ChamviError) {
                throw error;
            }

            throw new SandboxError(`cannot rebuild workspace pod ${name}`, { cause: error });
        }

        return openFound(id, info, findOptions.signal);
    }

    /** Opens a found workspace and reads its checkout; undefined (and not held) without the record. */
    async function openFound(id: string, info: WorkspaceInfo, signal?: AbortSignal): Promise<IWorkspace | undefined> {
        const workspace = open(id, info);
        const checkout = await readCheckout(workspace, signal, clock);

        if (!checkout) {
            // a create that died before its checkout finished: left to the collection
            live.delete(id);

            return undefined;
        }

        Object.assign(info, checkout);

        return workspace;
    }

    /**
     * The workspace of a run's claim (persistence): the held handle while its
     * pod runs (or its create here is still in flight), else one opened on
     * the running pod, else the pod rebuilt; a failed or finished pod is
     * deleted first (with `restore: false` a handle on the claim, only to
     * dispose). Undefined for an expired, deleting, foreign or unreadable claim.
     */
    async function findClaimed(
        claim: V1PersistentVolumeClaim,
        pod: V1Pod | undefined,
        runId: string,
        deployment: string,
        findOptions: WorkspaceFindOptions,
    ): Promise<IWorkspace | undefined> {
        const id = claim.metadata?.labels?.[WORKSPACE_LABEL] ?? '';
        const held = live.get(id);

        if (held && disposing.has(held)) {
            return undefined;
        }

        // a claim being deleted (pvc-protection holds it while its pod goes) was disposed
        if (claim.metadata?.deletionTimestamp) {
            return undefined;
        }

        const info = readWorkspaceInfo({ ...claim.metadata?.annotations, ...claim.metadata?.labels }, PROVIDER_NAME);

        if (!info || info.runId !== runId || info.expiresAt.getTime() <= clock.now().getTime()) {
            return undefined;
        }

        const running = pod !== undefined && !isEnded(pod) && podState(pod).state === 'running';

        if (held && !held.disposed && (running || creating.has(id))) {
            return held;
        }

        if (creating.has(id)) {
            return undefined;
        }

        if (held) {
            // gone (suspended elsewhere, evicted): forgotten, never disposed
            live.delete(id);
        }

        if (running) {
            return openFound(id, info, findOptions.signal);
        }

        if (findOptions.restore === false) {
            // a lookup to remove it: no pod scheduled, the handle's dispose deletes pod and claim
            return open(id, info);
        }

        if (pod && !pod.metadata?.deletionTimestamp && podState(pod).state === 'failed') {
            await guard(`delete workspace pod ${pod.metadata?.name}`, () => client.delete(pod.metadata!.name!));
        }

        return rebuildPod(id, info, deployment, findOptions);
    }

    /**
     * Deletes the pod of a suspendable run (`answer` true) and keeps its
     * claim, after dropping its held handle (never disposed), so the next
     * `find` rebuilds it; a SandboxError for a rejected `isSuspendable` or a
     * failed delete (the pod keeps running).
     */
    async function suspend(name: string, labels: Record<string, string>, answer: boolean | SandboxError): Promise<unknown> {
        if (answer !== true) {
            return answer === false ? undefined : answer;
        }

        const id = labels[WORKSPACE_LABEL] ?? '';
        const held = live.get(id);

        // one being disposed is removed, one being created is not yet the run's to lose
        if ((held && disposing.has(held)) || creating.has(id)) {
            return undefined;
        }

        live.delete(id);

        try {
            await guard(`suspend workspace pod ${name}`, () => client.delete(name));
        } catch (error) {
            return error;
        }

        return undefined;
    }

    return {
        name: PROVIDER_NAME,

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
                ...buildWorkspaceInfo(input, PROVIDER_NAME, clock.now(), limits.maxLifetimeMs),
                image: input.image ?? image,
            };
            const transport = transportOf(name);
            const workspace = open(id, info, transport);

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
                await waitForRunning(name, input.signal);
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

            const selector = `${MANAGED_SELECTOR},${DEPLOYMENT_LABEL}=${deployment},${RUN_LABEL}=${runId}`;
            const pods = await guard('list the workspace pods', () => client.list(selector));
            const claims = persistence ?
                await guard('list the workspace claims', () => client.listClaims!(selector)) :
                [];
            const now = clock.now().getTime();
            const found: IWorkspace[] = [];
            const claimed = new Set<string>();

            // a claim's workspace comes back even without a running pod; a failed rebuild throws, never skips it
            for (const claim of claims) {
                const name = claim.metadata?.name ?? '';
                const workspace = await findClaimed(
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

                const info = readWorkspaceInfo({ ...pod.metadata?.annotations, ...labels }, PROVIDER_NAME);

                if (!info || info.runId !== runId || info.expiresAt.getTime() <= now) {
                    continue;
                }

                const workspace = await openFound(id, info, findOptions.signal);

                if (workspace) {
                    found.push(workspace);
                }
            }

            return found;
        },

        async collectGarbage(gcOptions = {}) {
            const deployment = assertDeployment(gcOptions.deployment);
            const selector = `${MANAGED_SELECTOR},${DEPLOYMENT_LABEL}=${deployment}`;
            const pods = await guard('list the workspace pods', () => client.list(selector));
            const claims = persistence ?
                await guard('list the workspace claims', () => client.listClaims!(selector)) :
                [];
            const now = clock.now().getTime();
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
                        const failure = await suspend(name, metadata?.labels ?? {}, await isSuspendable(metadata?.labels?.[RUN_LABEL] ?? ''));

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
                            await deleteClaim(name);
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
