/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamvi/core';
import type {
    AgentRevision,
    Artifact,
    Connection,
    Run,
} from '@chamvi/core';

const UUID_LABEL_BYTES = 16;

/**
 * A deterministic UUID-shaped id for a short ASCII label: the label's bytes, NUL-padded
 * to 16 and formatted 8-4-4-4-12, so the byte order of labels is the byte order of ids.
 */
export function testUuid(label: string): string {
    const bytes = Buffer.from(label, 'utf8');

    if (bytes.length > UUID_LABEL_BYTES) {
        throw new RangeError(`testUuid label "${label}" is longer than ${UUID_LABEL_BYTES} bytes`);
    }

    const hex = Buffer.concat([bytes, Buffer.alloc(UUID_LABEL_BYTES - bytes.length)]).toString('hex');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function makeRun(id: string, overrides: Partial<Run> = {}): Run {
    const createdAt = new Date(1_000);

    return {
        id,
        agent: 'a',
        status: RunStatus.QUEUED,
        trigger: {
            id: `t-${id}`,
            agent: 'a',
            trigger: 'http',
            channel: 'http',
            payload: {},
            receivedAt: createdAt,
        },
        usage: { inputTokens: 0, outputTokens: 0 },
        createdAt,
        updatedAt: createdAt,
        ...overrides,
    };
}

/** A run whose `trigger.parent` names `parentRunId` (created at `at`). */
export function makeChild(id: string, parentRunId: string, at = 1_000): Run {
    const run = makeRun(id, { createdAt: new Date(at), updatedAt: new Date(at) });

    run.trigger = {
        ...run.trigger,
        channel: 'agent',
        parent: {
            kind: 'dispatch',
            runId: parentRunId,
            agent: 'a',
            role: 'default',
            depth: 1,
        },
    };

    return run;
}

export function makeArtifact(id: string, overrides: Partial<Artifact> = {}): Artifact {
    return {
        id,
        runId: testUuid('r1'),
        agent: 'a',
        mediaType: 'text/plain',
        filename: `${id}.txt`,
        size: 3,
        createdAt: new Date(1_000),
        ...overrides,
    };
}

export function makeAgentRevision(agent: string, overrides: Partial<AgentRevision> = {}): AgentRevision {
    return {
        agent,
        hash: 'h1',
        changedAt: new Date(1_000),
        ...overrides,
    };
}

export function makeConnection(name: string, overrides: Partial<Connection> = {}): Connection {
    return {
        name,
        type: 'whatsapp',
        keyId: 'k1',
        wrappedKey: new Uint8Array([1, 2, 3, 4]),
        createdAt: new Date(1_000),
        updatedAt: new Date(1_000),
        ...overrides,
    };
}
