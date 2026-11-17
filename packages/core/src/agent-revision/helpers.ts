/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { AgentRevision, AgentRevisionRecord } from '@chamvi/store';

/** A stored marker as the service returns it: no storage id, `changedAt` a fresh Date. */
export function readAgentRevision(record: AgentRevisionRecord): AgentRevision {
    return {
        agent: record.agent,
        hash: record.hash,
        changedAt: new Date(record.changedAt.getTime()),
    };
}
