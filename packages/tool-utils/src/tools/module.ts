/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool, ToolSet } from 'ai';
import { normalizeOptions } from '../options/module.ts';
import type { UtilityToolName, UtilityToolsOptions, UtilityToolsOptionsNormalized } from '../options/types.ts';
import { currentTimeTool } from './current-time.ts';
import { dateAddTool } from './date-add.ts';
import { dateDiffTool } from './date-diff.ts';
import { dateInfoTool } from './date-info.ts';
import { nextWeekdayTool } from './next-weekday.ts';
import { timeConvertTool } from './time-convert.ts';

type ToolBuilder = (options: UtilityToolsOptionsNormalized) => Tool<any, any>;

/** The tools built so far, by name. */
const REGISTRY: Partial<Record<UtilityToolName, ToolBuilder>> = {
    current_time: currentTimeTool,
    time_convert: timeConvertTool,
    date_add: dateAddTool,
    date_diff: dateDiffTool,
    date_info: dateInfoTool,
    next_weekday: nextWeekdayTool,
};

/**
 * The utility tools a model cannot do reliably itself: `current_time` and
 * the others in `include` (default all). Options are checked when called
 * (InvalidAgentDefinitionError).
 */
export function utilityTools(options: UtilityToolsOptions = {}): ToolSet {
    const normalized = normalizeOptions(options);
    const tools: ToolSet = {};

    for (const name of normalized.include) {
        const build = REGISTRY[name];

        if (build) {
            tools[name] = build(normalized);
        }
    }

    return tools;
}
