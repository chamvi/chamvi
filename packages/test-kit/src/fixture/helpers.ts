/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamvi/core-kit';
import type { Artifact, Run } from '@chamvi/core-kit';

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

/** A uuid v7: the version and variant nibbles of RFC 9562. */
export const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * A deterministic uuid v7 of the unix millisecond `ms` and a counter within
 * it (`rand_a`, 12 bits), as `uuidv7` issues them: ids of one millisecond
 * order by `counter`.
 */
export function testUuidV7(ms: number, counter: number): string {
    const time = ms.toString(16).padStart(12, '0');
    const sequence = counter.toString(16).padStart(3, '0');

    return `${time.slice(0, 8)}-${time.slice(8)}-7${sequence}-8000-000000000000`;
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
