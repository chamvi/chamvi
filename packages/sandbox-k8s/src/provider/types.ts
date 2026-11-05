/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { KubeConfig } from '@kubernetes/client-node';
import type { IClock } from '@chamvi/core';
import type { SandboxLimits, WorkspaceInfo } from '@chamvi/sandbox';
import type { IPodClient } from '../client/types.ts';

export type ImagePullPolicy = 'Always' | 'IfNotPresent';

export type PodUser = {
    uid: number;
    gid: number;
};

/**
 * A ReadWriteOnce claim per workspace (`chamvi-ws-<id>`, like its pod)
 * holding `/workspace` and `/home/sandbox`, so the files outlive the pod.
 */
export type KubernetesPersistence = {
    /** A DNS-1123 subdomain; default the cluster's default storage class. */
    storageClassName?: string;
    /** The claim's storage request (a quantity); default the resolved `limits.storage`. */
    size?: string;
};

export type KubernetesSandboxOptions = {
    /** Namespace of the workspace pods (required). */
    namespace: string;
    /** Default `new KubeConfig()` with `loadFromDefault()` (in-cluster or `KUBECONFIG`). */
    kubeConfig?: KubeConfig;
    /** Default `DEFAULT_SANDBOX_IMAGE`; pin a digest in production. */
    image?: string;
    /** Added to every workspace's environment, after `SANDBOX_ENV`. */
    env?: Record<string, string>;
    limits?: SandboxLimits;
    /** Extra pod labels (e.g. for a NetworkPolicy); may not name a managed label. */
    podLabels?: Record<string, string>;
    /**
     * Pull policy of every workspace image (the provider's, the manager's
     * and one a run asked for through `create_workspace({ image })`):
     * default `'IfNotPresent'`, `'Always'` for a mutable tag.
     */
    imagePullPolicy?: ImagePullPolicy;
    /**
     * uid and gid of the pod; default `{ uid: 0, gid: 0 }` (root with the
     * `ROOT_CAPABILITIES`, which needs a namespace whose Pod Security admits
     * root pods, i.e. `baseline`). `{ uid: 1000, gid: 1000 }` with
     * `readOnlyRoot: true` is the hardened mode, which `restricted` admits.
     */
    user?: PodUser;
    /** A read-only root filesystem (only `/workspace`, `/cache` and `/tmp` writable). Default false. */
    readOnlyRoot?: boolean;
    /**
     * A ReadWriteMany claim every workspace mounts at `/cache`, shared by every
     * run and agent of the namespace (a package one run fetched can be used by
     * another). Without it each pod gets an emptyDir `/cache` of its own.
     */
    cache?: { claimName: string };
    /**
     * Keep each workspace's files on a claim of its own (see
     * `KubernetesPersistence`); a custom `client` then needs the claim
     * methods. Default none: the files live in emptyDirs and go with the pod.
     */
    persistence?: KubernetesPersistence;
    /** Size of the in-memory `/tmp`; default `TMP_SIZE` (`'1Gi'`). */
    tmpSize?: string;
    /** Default `START_TIMEOUT_MS`. */
    startTimeoutMs?: number;
    /** Default `POLL_MS`. */
    pollMs?: number;
    clock?: IClock;
    /** Test seam; default `createPodClient({ kubeConfig, namespace })`. */
    client?: IPodClient;
};

export type PodInput = {
    id: string;
    deployment: string;
    namespace: string;
    /** Run, image, repo, ref and times: labels and annotations a provider's `find` rebuilds the info from. */
    info: WorkspaceInfo & { image: string };
    env: Record<string, string>;
    limits: Required<SandboxLimits>;
    /** The `podLabels`; the managed labels win. */
    labels: Record<string, string>;
    imagePullPolicy: ImagePullPolicy;
    user: PodUser;
    readOnlyRoot: boolean;
    /** The shared cache claim; undefined mounts an emptyDir. */
    cacheClaim?: string;
    /** The workspace's own claim for `/workspace` and the home; undefined mounts emptyDirs. */
    claim?: string;
    tmpSize: string;
};

export type ClaimInput = {
    id: string;
    deployment: string;
    namespace: string;
    /** The same labels and annotations as the pod's, so `readWorkspaceInfo()` works on the claim. */
    info: WorkspaceInfo & { image: string };
    /** The storage request, a quantity. */
    size: string;
    storageClassName?: string;
};
