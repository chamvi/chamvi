/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { inject } from '@chamvi/core';
import type { IContextProvider, StateSchema, ToolContext } from '@chamvi/core';
import type { ICalendarClient } from '../client/types.ts';
import type { ICalendarWriteClient } from '../write-client/types.ts';
import { CALENDAR_CONTEXT, CALENDAR_WRITE_CONTEXT } from './constants.ts';

/** Provides `client` to every tool, tools factory and effect hook of the engine's runs (`calendarTools()` without accounts). */
export function provideCalendarContext(provider: IContextProvider, client: ICalendarClient): void {
    provider.provide(CALENDAR_CONTEXT, client);
}

/** The calendar client provided on the engine; throws ContextNotProvidedError (naming `calendar`) without one. */
export function injectCalendarContext<S extends StateSchema = StateSchema>(ctx: ToolContext<S>): ICalendarClient {
    return inject(ctx, CALENDAR_CONTEXT);
}

/** Provides the write `client` to every tool, tools factory and effect hook of the engine's runs (`calendarWriteTools()` without accounts). */
export function provideCalendarWriteContext(provider: IContextProvider, client: ICalendarWriteClient): void {
    provider.provide(CALENDAR_WRITE_CONTEXT, client);
}

/** The calendar write client provided on the engine; throws ContextNotProvidedError (naming `calendar-write`) without one. */
export function injectCalendarWriteContext<S extends StateSchema = StateSchema>(ctx: ToolContext<S>): ICalendarWriteClient {
    return inject(ctx, CALENDAR_WRITE_CONTEXT);
}
