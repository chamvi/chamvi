/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Writable } from 'node:stream';
import type {
    CoreV1Api,
    Exec,
    KubeConfig,
    V1PersistentVolumeClaim,
    V1Pod,
} from '@kubernetes/client-node';

export type PodExecInput = {
    argv: readonly string[];
    /** Written to the command; closed only on the `v5.channel.k8s.io` protocol. */
    stdin?: Uint8Array;
    stdout: Writable;
    stderr: Writable;
    /** Closes the socket: the command runs on until its `timeout` or the pod's deletion. */
    signal: AbortSignal;
};

/**
 * The pod operations the Kubernetes sandbox needs, in one namespace. Every
 * failure is a `SandboxError`; deleting a missing pod is fine. The claim
 * methods are needed only with the provider's `persistence`.
 */
export interface IPodClient {
    create(pod: V1Pod): Promise<V1Pod>;
    read(name: string): Promise<V1Pod>;
    /** Without a grace period; a missing pod is fine. */
    delete(name: string): Promise<void>;
    list(labelSelector: string): Promise<V1Pod[]>;
    /** Runs argv in the pod's sandbox container; the exit code from the exec status. */
    exec(name: string, input: PodExecInput): Promise<{ exitCode: number }>;
    createClaim?(claim: V1PersistentVolumeClaim): Promise<V1PersistentVolumeClaim>;
    /** A missing claim is fine. */
    deleteClaim?(name: string): Promise<void>;
    listClaims?(labelSelector: string): Promise<V1PersistentVolumeClaim[]>;
}

export type CreatePodClientInput = {
    kubeConfig: KubeConfig;
    namespace: string;
};

export type PodClientParts = {
    core: Pick<
        CoreV1Api,
        'createNamespacedPod' |
        'readNamespacedPod' |
        'deleteNamespacedPod' |
        'listNamespacedPod' |
        'createNamespacedPersistentVolumeClaim' |
        'deleteNamespacedPersistentVolumeClaim' |
        'listNamespacedPersistentVolumeClaim'
    >;
    exec: Pick<Exec, 'exec'>;
    namespace: string;
};

/** The part of the exec WebSocket the client uses. */
export type ExecSocket = {
    readonly protocol: string;
    close(): void;
    on(event: 'close', listener: () => void): unknown;
    on(event: 'error', listener: (error: Error) => void): unknown;
};
