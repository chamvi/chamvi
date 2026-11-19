/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run } from '@chamvi/store';

export interface IEnginePeerReceiver {
    /**
     * The receiver's signals to the peer that started a run, for `run`
     * (settled, or an approval pending in it): detached, best effort, never
     * throws (a failure reaches onError).
     */
    onRunEvent(run: Run): void;
}
