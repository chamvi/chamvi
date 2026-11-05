/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AppToken, ModuleName } from '@chamvi/app';
import type { IContainer, IModule } from '@chamvi/app';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import { createCalendarClient } from '../client/module.ts';
import type { CalendarAccount, ICalendarClient } from '../client/types.ts';
import { provideCalendarContext } from '../context/module.ts';
import { normalizeAccounts, normalizeClientOptions } from '../options/module.ts';
import { TOOL_CALENDAR_MODULE_NAME } from './constants.ts';
import { readCalendarAccountsFromEnv, readCalendarTimezoneFromEnv } from './helpers.ts';
import type { ToolCalendarModuleOptions } from './types.ts';

/**
 * One calendar client for the app, provided on the engine
 * (`calendarTools()` without accounts injects it). The accounts (the
 * `accounts` option, else `CHAMVI_CALENDAR_ACCOUNTS` with its credential
 * variables) and the zone (`CHAMVI_CALENDAR_TIMEZONE`, else `timezone`) are
 * read and checked when the factory is called (InvalidAgentDefinitionError,
 * never echoing a value). Without accounts the module does nothing. In start
 * and job mode and a check, `setup` builds the client on the app's clock; the
 * lifecycle hook provides it (`engineCreated`) and closes it once the engine
 * drained (`drained`), `teardown` closes it too. Migrate mode does nothing.
 */
export class ToolCalendarModule implements IModule {
    readonly name: string = TOOL_CALENDAR_MODULE_NAME;

    readonly dependencies = [ModuleName.CONFIG, ModuleName.ENGINE];

    protected options: ToolCalendarModuleOptions;

    protected accounts: CalendarAccount[] | undefined;

    protected timezone: string | undefined;

    protected client: ICalendarClient | undefined;

    constructor(options: ToolCalendarModuleOptions = {}) {
        if (!isObject(options)) {
            throw new InvalidAgentDefinitionError('toolCalendarModule() options must be an object.');
        }

        if (options.env !== undefined && !isObject(options.env)) {
            throw new InvalidAgentDefinitionError('toolCalendarModule() env must be an object.');
        }

        const env = options.env ?? process.env;

        this.options = options;
        this.accounts = options.accounts !== undefined ?
            normalizeAccounts(options.accounts) :
            readCalendarAccountsFromEnv(env);
        this.timezone = readCalendarTimezoneFromEnv(env) ?? options.timezone;

        // the rest is checked now; the clock is the app's, known in setup
        normalizeClientOptions({
            ...(this.timezone !== undefined && { timezone: this.timezone }),
            ...(options.fetch !== undefined && { fetch: options.fetch }),
        });
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);
        const { accounts } = this;

        if (context.mode === 'migrate' || accounts === undefined || accounts.length === 0) {
            return;
        }

        const client = createCalendarClient(accounts, {
            clock: container.resolve(AppToken.CLOCK),
            ...(this.timezone !== undefined && { timezone: this.timezone }),
            ...(this.options.fetch !== undefined && { fetch: this.options.fetch }),
        });

        this.client = client;

        container.registerMany(AppToken.LIFECYCLE_HOOKS, {
            useValue: {
                name: this.name,
                engineCreated: (engine) => provideCalendarContext(engine, client),
                drained: () => client.close(),
            },
        });
    }

    async teardown(): Promise<void> {
        await this.client?.close();
    }
}

/** The calendar module (`chamvi:tool-calendar`); see `ToolCalendarModule`. */
export function toolCalendarModule(options?: ToolCalendarModuleOptions): ToolCalendarModule {
    return new ToolCalendarModule(options);
}
