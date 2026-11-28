/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Step, StepRecord } from '@chamvi/core-kit';

/** A stored step as the service returns it: without its row id, which never leaves the service. */
export function readStep(record: StepRecord): Step {
    const step: Partial<StepRecord> = { ...record };

    delete step.id;

    return step as Step;
}
