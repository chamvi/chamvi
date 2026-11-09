/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AppToken, ModuleName, readStoredConnections } from '@chamvi/app';
import type { Env, IContainer, IModule } from '@chamvi/app';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import { createCalendarClient } from '../client/module.ts';
import type { ICalendarClient } from '../client/types.ts';
import { createUnconfiguredCalendarClient } from '../client/unconfigured.ts';
import { provideCalendarContext } from '../context/module.ts';
import { normalizeAccounts, normalizeClientOptions } from '../options/module.ts';
import { CALENDAR_CONNECTION_TYPE, TOOL_CALENDAR_MODULE_NAME } from './constants.ts';
import { readCalendarEnvEntries, readCalendarTimezoneFromEnv } from './helpers.ts';
import { calendarConnectionDefinition, loadCalendarAccounts } from './type.ts';
import type { CalendarEnvEntry, ToolCalendarModuleOptions } from './types.ts';

/**
 * One calendar client for the app, provided on the engine
 * (`calendarTools()` without accounts injects it). The accounts (the
 * `accounts` option, else `CHAMVI_CALENDAR_ACCOUNTS` with its credential
 * variables) and the zone (`CHAMVI_CALENDAR_TIMEZONE`, else `timezone`) are
 * read and checked when the factory is called (InvalidAgentDefinitionError,
 * never echoing a value). `setup` adds the accounts stored in the connection
 * store, the env winning per field, and fails naming the variable for a
 * declared account whose user or password is in neither; the `accounts`
 * option pins the set, and a check that finds the store behind its migrations
 * warns and goes on with the env. The accounts are listed as connections of
 * the type `calendar`. Without any, tools report a not-configured tool error. The
 * lifecycle hook provides the client (`engineCreated`) and closes it once the
 * engine drained (`drained`), `teardown` closes it too. Migrate mode does
 * nothing.
 */
export class ToolCalendarModule implements IModule {
    readonly name: string = TOOL_CALENDAR_MODULE_NAME;

    readonly dependencies = [ModuleName.CONFIG, ModuleName.STORE, ModuleName.ENGINE];

    protected options: ToolCalendarModuleOptions;

    protected accounts: CalendarEnvEntry[] | undefined;

    /** The `accounts` option: the set is fixed, the store unread. */
    protected pinned: boolean;

    protected env: Env;

    protected timezone: string | undefined;

    protected client: ICalendarClient | undefined;

    constructor(options: ToolCalendarModuleOptions = {}) {
        if (!isObject(options)) {
            throw new InvalidAgentDefinitionError('toolCalendarModule() options must be an object.');
        }

        if (options.env !== undefined && !isObject(options.env)) {
            throw new InvalidAgentDefinitionError('toolCalendarModule() env must be an object.');
        }

        this.env = options.env ?? process.env;
        this.pinned = options.accounts !== undefined;
        this.options = options;
        this.accounts = options.accounts !== undefined ?
            normalizeAccounts(options.accounts).map((account) => ({ account })) :
            readCalendarEnvEntries(this.env);
        this.timezone = readCalendarTimezoneFromEnv(this.env) ?? options.timezone;

        // the rest is checked now; the clock is the app's, known in setup
        normalizeClientOptions({
            ...(this.timezone !== undefined && { timezone: this.timezone }),
            ...(options.fetch !== undefined && { fetch: options.fetch }),
        });
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);

        if (context.mode === 'migrate') {
            return;
        }

        const editable = !this.pinned && container.resolve(AppToken.STORE).connections !== undefined;
        const definition = calendarConnectionDefinition(this.options.fetch ? { fetch: this.options.fetch } : {});
        const loaded = await loadCalendarAccounts({
            definition,
            declared: this.accounts ?? [],
            pinned: this.pinned,
            env: this.env,
            logger: container.resolve(AppToken.LOGGER),
            rows: this.pinned ? [] : await readStoredConnections(container, CALENDAR_CONNECTION_TYPE),
            editable,
        });

        container.registerMany(AppToken.CONNECTION_TYPES, {
            useValue: {
                definition,
                creatable: () => editable,
                connections: () => loaded.connections,
            },
        });

        const client = loaded.accounts.length > 0 ?
            createCalendarClient(loaded.accounts, {
                clock: container.resolve(AppToken.CLOCK),
                ...(this.timezone !== undefined && { timezone: this.timezone }),
                ...(this.options.fetch !== undefined && { fetch: this.options.fetch }),
            }) :
            createUnconfiguredCalendarClient(CALENDAR_CONNECTION_TYPE);

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
