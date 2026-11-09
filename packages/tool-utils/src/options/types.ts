/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { UTILITY_TOOL_NAMES } from '../tools/constants.ts';

export type UtilityToolName = typeof UTILITY_TOOL_NAMES[number];

export type UtilityToolsOptions = {
    /** The default IANA zone; wins over `CHAMVI_TIMEZONE`, which wins over UTC. */
    timezone?: string;
    /** The tools to build (default all); an empty list is refused. */
    include?: UtilityToolName[];
    /** Where `CHAMVI_TIMEZONE` is read when the factory is called; default `process.env`. */
    env?: Record<string, string | undefined>;
};

/** The options checked, with their defaults. */
export type UtilityToolsOptionsNormalized = {
    timezone: string;
    include: UtilityToolName[];
};
