/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { inject } from '@chamvi/core';
import type { IContextProvider, StateSchema, ToolContext } from '@chamvi/core';
import type { ICalendarClient } from '../client/types.ts';
import { CALENDAR_CONTEXT } from './constants.ts';

/** Provides `client` to every tool, tools factory and effect hook of the engine's runs (`calendarTools()` without accounts). */
export function provideCalendarContext(provider: IContextProvider, client: ICalendarClient): void {
    provider.provide(CALENDAR_CONTEXT, client);
}

/** The calendar client provided on the engine; throws ContextNotProvidedError (naming `calendar`) without one. */
export function injectCalendarContext<S extends StateSchema = StateSchema>(ctx: ToolContext<S>): ICalendarClient {
    return inject(ctx, CALENDAR_CONTEXT);
}
