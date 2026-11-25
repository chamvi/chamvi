/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { InvalidAgentDefinitionError, inject } from '@chamvi/core';
import { isObject } from 'smob';
import { CALENDAR_WRITE_CONTEXT } from '../context/constants.ts';
import { normalizeClientOptions } from '../options/module.ts';
import type { CalendarClientOptions } from '../options/types.ts';
import { createCalendarWriteClient } from '../write-client/module.ts';
import type { ICalendarWriteClient } from '../write-client/types.ts';
import { calendarCreateTool } from './create.ts';
import type { CalendarLimitSettings, CalendarWriteClientSource, CalendarWriteToolsOptions } from './types.ts';

const CALLER = 'calendarWriteTools()';

const CLIENT_METHODS = ['calendar', 'organizer', 'create', 'findCreated', 'describe', 'remove', 'close'] as const;

function isCalendarWriteClient(value: unknown): value is ICalendarWriteClient {
    return isObject(value) && CLIENT_METHODS.every((name) => typeof value[name] === 'function');
}

function limitOf(value: unknown, name: string): CalendarLimitSettings | false | undefined {
    if (value !== undefined && value !== false && !isObject(value)) {
        throw new InvalidAgentDefinitionError(`${CALLER} ${name} must be an object or false.`);
    }

    return value as CalendarLimitSettings | false | undefined;
}

function sourceOf(
    accounts: CalendarWriteToolsOptions['accounts'],
    client: CalendarWriteToolsOptions['client'],
    clientOptions: CalendarClientOptions,
): CalendarWriteClientSource {
    if (accounts !== undefined && client !== undefined) {
        throw new InvalidAgentDefinitionError(`${CALLER} takes either accounts or client.`);
    }

    if (client !== undefined) {
        if (!isCalendarWriteClient(client)) {
            throw new InvalidAgentDefinitionError(`${CALLER} client must be a calendar write client (createCalendarWriteClient()).`);
        }

        return () => client;
    }

    if (accounts !== undefined) {
        const own = createCalendarWriteClient(accounts, clientOptions);

        return () => own;
    }

    // the client the calendar module provided; ContextNotProvidedError (a tool error) without one
    return (ctx) => inject(ctx, CALENDAR_WRITE_CONTEXT);
}

/**
 * The calendar write tools: `calendar_create` (a PUT of a new event; with
 * attendees always approved by the owner with the whole invitation, limited
 * by `createLimit`, default 20 an hour). They use `client`, else a client of
 * `accounts`, else the write client the calendar module provided on the
 * engine. Options are checked when called (InvalidAgentDefinitionError).
 */
export function calendarWriteTools(options: CalendarWriteToolsOptions = {}): ToolSet {
    if (!isObject(options)) {
        throw new InvalidAgentDefinitionError(`${CALLER} options must be an object.`);
    }

    const {
        accounts,
        client,
        classifier,
        createLimit,
        deleteLimit,
        ...clientOptions
    } = options;

    if (classifier !== undefined && !isObject(classifier)) {
        throw new InvalidAgentDefinitionError(`${CALLER} classifier must be an object.`);
    }

    // checked even when the module's client is used; the classifier's clock and timeout come from here
    normalizeClientOptions(clientOptions);

    const create = limitOf(createLimit, 'createLimit');

    limitOf(deleteLimit, 'deleteLimit');

    const source = sourceOf(accounts, client, clientOptions);

    return { calendar_create: calendarCreateTool(source, { ...(create !== undefined && { limit: create }) }) };
}
