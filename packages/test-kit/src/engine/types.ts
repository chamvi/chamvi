/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { EngineOptions, IConversationService, IEngine } from '@chamvi/core';

export type TestEngineOptions = Omit<
    EngineOptions,
    'runService' | 'stepService' | 'checkpointService' | 'effectService' | 'artifactService' | 'stateService' |
    'agentRevisionService' | 'lockService' | 'idempotencyService' | 'connectionService' | 'conversationService'
> & {
    /**
     * Another engine to be a replica of: the new engine runs on every one
     * of its services (the same rows, as two processes over one database),
     * on its clock: a `clock` other than `replicaOf.clock` is refused.
     */
    replicaOf?: IEngine;
    /**
     * Wraps the conversation service the helper built (to inject a fault
     * or a recorder); it gets the service on the engine's registry. Not
     * with `replicaOf`.
     */
    conversationService?: (service: IConversationService) => IConversationService;
};
