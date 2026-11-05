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
import { createMailClient } from '../client/module.ts';
import type { IMailClient, MailAccount } from '../client/types.ts';
import { provideMailContext } from '../context/module.ts';
import { normalizeAccounts } from '../options/module.ts';
import { TOOL_MAIL_MODULE_NAME } from './constants.ts';
import { readMailAccountsFromEnv } from './helpers.ts';
import type { ToolMailModuleOptions } from './types.ts';

/**
 * One mail client for the app, provided on the engine (`mailTools()`
 * without accounts injects it). The accounts (the `accounts` option, else
 * `CHAMVI_MAIL_ACCOUNTS` with its credential variables) are read and checked
 * when the factory is called (InvalidAgentDefinitionError, never echoing a
 * value). Without accounts the module does nothing. In start and job mode
 * and a check, `setup` builds the client on the app's clock; the lifecycle
 * hook provides it (`engineCreated`) and logs out once the engine drained
 * (`drained`), `teardown` logs out too. Migrate mode does nothing.
 */
export class ToolMailModule implements IModule {
    readonly name: string = TOOL_MAIL_MODULE_NAME;

    readonly dependencies = [ModuleName.CONFIG, ModuleName.ENGINE];

    protected accounts: MailAccount[] | undefined;

    protected client: IMailClient | undefined;

    constructor(options: ToolMailModuleOptions = {}) {
        if (!isObject(options)) {
            throw new InvalidAgentDefinitionError('toolMailModule() options must be an object.');
        }

        if (options.env !== undefined && !isObject(options.env)) {
            throw new InvalidAgentDefinitionError('toolMailModule() env must be an object.');
        }

        if (options.accounts !== undefined) {
            normalizeAccounts(options.accounts, 'toolMailModule()');
            this.accounts = options.accounts;
        } else {
            this.accounts = readMailAccountsFromEnv(options.env ?? process.env);
        }
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);
        const { accounts } = this;

        if (context.mode === 'migrate' || accounts === undefined || accounts.length === 0) {
            return;
        }

        const client = createMailClient(accounts, { clock: container.resolve(AppToken.CLOCK) });

        this.client = client;

        container.registerMany(AppToken.LIFECYCLE_HOOKS, {
            useValue: {
                name: this.name,
                engineCreated: (engine) => provideMailContext(engine, client),
                drained: () => client.close(),
            },
        });
    }

    async teardown(): Promise<void> {
        await this.client?.close();
    }
}

/** The mail module (`chamvi:tool-mail`); see `ToolMailModule`. */
export function toolMailModule(options?: ToolMailModuleOptions): ToolMailModule {
    return new ToolMailModule(options);
}
