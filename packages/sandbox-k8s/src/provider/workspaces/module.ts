/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { V1Pod } from '@kubernetes/client-node';
import type { IClock } from '@chamvi/core';
import { SandboxError, systemClock } from '@chamvi/core';
import {
    DEFAULT_SANDBOX_IMAGE,
    TMP_SIZE,
    abortedCreate,
    createRemoteWorkspace,
    delay,
    readCheckout,
} from '@chamvi/sandbox';
import type { IExecTransport, IWorkspace, WorkspaceInfo } from '@chamvi/sandbox';
import type { IPodClient } from '../../client/types.ts';
import { createPodClient } from '../../client/module.ts';
import { createPodTransport } from '../../transport/module.ts';
import { POD_NAME_PREFIX, POLL_MS, START_TIMEOUT_MS } from '../constants.ts';
import { guard, loadDefaultKubeConfig, podState } from '../helpers.ts';
import type {
    ImagePullPolicy,
    KubernetesPersistence,
    KubernetesSandboxOptions,
    PodUser,
} from '../types.ts';
import { isStatus, messageOf } from './helpers.ts';

/** The options, the client and the workspace state of one Kubernetes provider, and the pod operations over them. */
export class KubernetesWorkspaces {
    readonly options: KubernetesSandboxOptions;

    readonly namespace: string;

    readonly client: IPodClient;

    readonly image: string;

    readonly imagePullPolicy: ImagePullPolicy;

    readonly user: PodUser;

    readonly readOnlyRoot: boolean;

    readonly tmpSize: string;

    readonly startTimeoutMs: number;

    readonly pollMs: number;

    readonly clock: IClock;

    readonly persistence: KubernetesPersistence | undefined;

    readonly live = new Map<string, IWorkspace>();

    // handles whose dispose was called: never answered, rebuilt or suspended
    readonly disposing = new WeakSet<IWorkspace>();

    // ids whose disposal-only handle (never held) is being or failed to be removed: never answered
    readonly removing = new Set<string>();

    // ids of the creates in flight here: their claim may exist before the pod
    readonly creating = new Set<string>();

    // the pod deletes of suspensions in flight, by workspace id: a find waits them out
    readonly suspensions = new Map<string, Promise<unknown>>();

    constructor(options: KubernetesSandboxOptions) {
        this.options = options;
        this.namespace = options.namespace;
        this.client = options.client ?? createPodClient({
            kubeConfig: options.kubeConfig ?? loadDefaultKubeConfig(),
            namespace: this.namespace,
        });
        this.image = options.image ?? DEFAULT_SANDBOX_IMAGE;
        this.imagePullPolicy = options.imagePullPolicy ?? 'IfNotPresent';
        this.user = options.user ?? { uid: 0, gid: 0 };
        this.readOnlyRoot = options.readOnlyRoot ?? false;
        this.tmpSize = options.tmpSize ?? TMP_SIZE;
        this.startTimeoutMs = options.startTimeoutMs ?? START_TIMEOUT_MS;
        this.pollMs = options.pollMs ?? POLL_MS;
        this.clock = options.clock ?? systemClock;
        this.persistence = options.persistence;
    }

    /** Deletes claim `name` (missing is fine); only called with `persistence`, whose check found the method. */
    deleteClaim(name: string): Promise<void> {
        return guard(`delete workspace claim ${name}`, () => this.client.deleteClaim!(name));
    }

    /** The pod's transport; with `persistence` its removal deletes the claim of the same name after the pod. */
    transportOf(name: string): IExecTransport {
        const transport = createPodTransport(this.client, name);

        if (!this.persistence) {
            return transport;
        }

        const deleteClaim = () => this.deleteClaim(name);

        return {
            ...transport,
            async remove() {
                // always the claim too: pvc-protection keeps one in use until its pod is gone
                const [pod, claim] = await Promise.allSettled([
                    transport.remove(),
                    deleteClaim(),
                ]);

                if (pod.status === 'rejected' && claim.status === 'rejected') {
                    throw new SandboxError(`cannot remove workspace ${name}: ${messageOf(pod.reason)}; ${messageOf(claim.reason)}`, { cause: new AggregateError([pod.reason, claim.reason]) });
                }

                if (pod.status === 'rejected') {
                    throw pod.reason;
                }

                if (claim.status === 'rejected') {
                    throw claim.reason;
                }
            },
        };
    }

    /** Resolves once the pod runs; SandboxError when it never will, takes too long or the signal fires. */
    async waitForRunning(name: string, signal?: AbortSignal, started = this.clock.now()): Promise<void> {
        for (;;) {
            if (signal?.aborted) {
                throw abortedCreate();
            }

            const state = podState(await this.client.read(name));

            if (state.state === 'running') {
                return;
            }

            if (state.state === 'failed') {
                throw new SandboxError(`workspace pod ${name} cannot start: ${state.reason}`);
            }

            const remaining = started + this.startTimeoutMs - this.clock.now();

            if (remaining <= 0) {
                throw new SandboxError(`workspace pod ${name} did not start within ${this.startTimeoutMs} ms.`);
            }

            await delay(this.clock, Math.min(this.pollMs, remaining), signal, () => abortedCreate());
        }
    }

    /**
     * The workspace of pod `chamvi-ws-<id>`, registered as live until
     * disposed; a `detached` one (only to remove it, its checkout never read)
     * is never registered, so no restoring `find` hands it out.
     */
    open(
        id: string,
        info: WorkspaceInfo,
        transport: IExecTransport = this.transportOf(`${POD_NAME_PREFIX}${id}`),
        detached = false,
    ): IWorkspace {
        const {
            live,
            disposing,
            removing,
        } = this;
        const remote = createRemoteWorkspace({
            id,
            info,
            transport,
            clock: this.clock,
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

                if (detached) {
                    removing.add(id);
                    await remote.dispose();
                    // removed: its pod and claim are never listed again
                    removing.delete(id);

                    return;
                }

                await remote.dispose();

                // a handle dropped by a suspension never unregisters the fresh one
                if (live.get(id) === workspace) {
                    live.delete(id);
                }
            },
        };

        if (!detached) {
            live.set(id, workspace);
        }

        return workspace;
    }

    /**
     * Creates pod `pod`, or joins one of the same name another `find` (here
     * or on another replica) created first (a 409 for a pod not being
     * deleted); a pod still being deleted is waited out up to the start
     * timeout. True when this call created it.
     */
    async createOrJoin(pod: V1Pod, started: number, signal?: AbortSignal): Promise<boolean> {
        const name = pod.metadata!.name!;

        for (;;) {
            if (signal?.aborted) {
                throw abortedCreate();
            }

            try {
                await this.client.create(pod);

                return true;
            } catch (error) {
                if (!isStatus(error, 409)) {
                    throw error;
                }
            }

            let existing: V1Pod | undefined;

            try {
                existing = await this.client.read(name);
            } catch (error) {
                if (!isStatus(error, 404)) {
                    throw error;
                }
            }

            if (existing && !existing.metadata?.deletionTimestamp) {
                return false;
            }

            const remaining = started + this.startTimeoutMs - this.clock.now();

            if (remaining <= 0) {
                throw new SandboxError(`workspace pod ${name} was still being deleted after ${this.startTimeoutMs} ms.`);
            }

            await delay(this.clock, Math.min(this.pollMs, remaining), signal, () => abortedCreate());
        }
    }

    /**
     * Opens a found workspace and reads its checkout; undefined (and not
     * held) without the record. With `failOnError` (a claim's workspace) a
     * read that keeps failing is a SandboxError (not held), never undefined.
     */
    async openFound(id: string, info: WorkspaceInfo, signal?: AbortSignal, failOnError = false): Promise<IWorkspace | undefined> {
        const workspace = this.open(id, info);
        let checkout: Awaited<ReturnType<typeof readCheckout>>;

        try {
            checkout = await readCheckout(workspace, signal, this.clock, { failOnError });
        } catch (error) {
            this.live.delete(id);

            throw error;
        }

        if (!checkout) {
            // a create that died before its checkout finished: left to the collection
            this.live.delete(id);

            return undefined;
        }

        Object.assign(info, checkout);

        return workspace;
    }

    /** Pod `name` as it is now, undefined once it is gone. */
    async readPod(name: string): Promise<V1Pod | undefined> {
        try {
            return await this.client.read(name);
        } catch (error) {
            if (isStatus(error, 404)) {
                return undefined;
            }

            throw error;
        }
    }
}
