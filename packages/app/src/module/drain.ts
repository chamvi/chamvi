/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { TypedToken } from 'eldin';
import type { IContainer } from 'eldin';
import { AppToken } from './constants.ts';

/** The shutdown's drain deadline (internal, not exported): epoch ms on the app clock. */
const DRAIN_DEADLINE = new TypedToken<{ at: number }>('chamvi.drain-deadline');

/**
 * What remains of the one `DRAIN_TIMEOUT_MS` budget the component
 * stop and the engine drain share (at least 0). The first call (the
 * components' stop, else the drain) fixes the deadline on the app clock, so
 * the drain gets only what the components left.
 */
export function remainingDrainMs(container: IContainer): number {
    const clock = container.resolve(AppToken.CLOCK);

    if (!container.has(DRAIN_DEADLINE)) {
        container.register(DRAIN_DEADLINE, { useValue: { at: clock.now() + container.resolve(AppToken.CONFIG).http.drainTimeoutMs } });
    }

    return Math.max(0, container.resolve(DRAIN_DEADLINE).at - clock.now());
}
