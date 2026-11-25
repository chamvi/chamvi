/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { ILogger } from '../../logger/types.ts';

export type ConfigModuleOptions = {
    /** `AppToken.CLOCK`; default `systemClock`. */
    clock?: IClock;
    /** `AppToken.LOGGER`; default the JSON line logger at `LOG_LEVEL`. */
    logger?: ILogger;
};
