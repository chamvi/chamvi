/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Env } from '@chamvi/app';
import type { OpenclawChannelOptions } from '../channel/types.ts';

/**
 * `openclawChannel()` options; the ones not given come from env,
 * `approvalUrl` defaults to the UI link from `PUBLIC_URL`, `clock` to
 * the app's.
 */
export type OpenclawModuleOptions = Partial<OpenclawChannelOptions> & {
    /** Default `process.env`, read when the factory is called. */
    env?: Env;
};
