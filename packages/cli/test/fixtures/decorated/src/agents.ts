/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { cron, defineSimpleAgent } from '@chamvi/app';
import { NoteStatus } from './entity.ts';

export const tick = defineSimpleAgent({
    name: 'tick',
    run: () => NoteStatus.Open,
    channels: [cron.on('0 0 1 1 *')],
});
