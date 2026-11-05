/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { CoreV1Api, Exec } from '@kubernetes/client-node';
import { createPodClientFrom } from './helpers.ts';
import type { CreatePodClientInput, IPodClient } from './types.ts';

/**
 * The pods of one namespace through `@kubernetes/client-node`: `CoreV1Api`
 * for create, read, delete and list of pods and claims, `Exec` (a WebSocket) for commands.
 * Builds the clients only; nothing is contacted until a call.
 */
export function createPodClient(input: CreatePodClientInput): IPodClient {
    return createPodClientFrom({
        core: input.kubeConfig.makeApiClient(CoreV1Api),
        exec: new Exec(input.kubeConfig),
        namespace: input.namespace,
    });
}
