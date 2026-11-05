/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import { createCalendarClient } from '../client/module.ts';
import { normalizeClientOptions } from '../options/module.ts';
import type { CalendarToolsOptions } from '../options/types.ts';
import { calendarEventsTool } from './events.ts';
import { calendarListTool } from './list.ts';

/**
 * The read-only calendar tools: `calendar_list` and `calendar_events`. With
 * `accounts` (or `client`) they read those; without, the client the module
 * provided on the engine. Options are checked when called
 * (InvalidAgentDefinitionError).
 */
export function calendarTools(options: CalendarToolsOptions = {}): ToolSet {
    if (!isObject(options)) {
        throw new InvalidAgentDefinitionError('calendarTools() options must be an object.');
    }

    const {
        accounts,
        client: given,
        ...rest
    } = options;

    if (accounts !== undefined && given !== undefined) {
        throw new InvalidAgentDefinitionError('calendarTools() takes either accounts or client.');
    }

    // checked even when the module's client is used
    normalizeClientOptions(rest);

    const client = accounts !== undefined ? createCalendarClient(accounts, rest) : given;

    return {
        calendar_list: calendarListTool(client),
        calendar_events: calendarEventsTool(client),
    };
}
