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
import { createMailClient } from '../client/module.ts';
import type { IMailClient } from '../client/types.ts';
import { createUnconfiguredMailClient } from '../client/unconfigured.ts';
import { provideMailContext, provideMailWriteContext } from '../context/module.ts';
import { normalizeAccounts } from '../options/module.ts';
import { normalizeSmtp } from '../write-client/asserts.ts';
import { createMailWriteClient } from '../write-client/module.ts';
import type { IMailWriteClient } from '../write-client/types.ts';
import { createUnconfiguredMailWriteClient } from '../write-client/unconfigured.ts';
import { MAIL_CONNECTION_TYPE, TOOL_MAIL_MODULE_NAME } from './constants.ts';
import { readMailAccountsFromEnv } from './helpers.ts';
import { loadMailAccounts, mailConnectionDefinition } from './type.ts';
import type { MailEnvAccount, ToolMailModuleOptions } from './types.ts';

/**
 * One mail client and one mail write client for the app, both of the same
 * accounts, provided on the engine (`mailTools()` and `mailWriteTools()`
 * without accounts inject them). The accounts (the `accounts` option, else
 * `CHAMVI_MAIL_ACCOUNTS` with its credential variables, each with optional
 * `smtp` settings, also stored as `smtpHost`, `smtpPort`, `smtpSecurity`) are read and checked
 * when the factory is called (InvalidAgentDefinitionError, never echoing a
 * value). `setup` adds the accounts stored in the connection store, the env
 * winning per field of a declared account only (a stored-only one reads no
 * variable), and fails naming the variable for a declared account
 * whose password is in neither; the `accounts` option pins the set, and a
 * check that finds the store behind its migrations warns and goes on with the
 * env. The accounts are listed as connections of the type `mail`. Without
 * any, tools report a not-configured tool error. The lifecycle hook
 * provides both clients (`engineCreated`) and logs both out once the engine
 * drained (`drained`), `teardown` logs out too. Migrate mode does nothing.
 */
export class ToolMailModule implements IModule {
    readonly name: string = TOOL_MAIL_MODULE_NAME;

    readonly dependencies = [ModuleName.CONFIG, ModuleName.STORE, ModuleName.ENGINE];

    protected accounts: MailEnvAccount[] | undefined;

    /** The `accounts` option: the set is fixed, the store unread. */
    protected pinned: boolean;

    protected env: Env;

    protected client: IMailClient | undefined;

    protected writeClient: IMailWriteClient | undefined;

    constructor(options: ToolMailModuleOptions = {}) {
        if (!isObject(options)) {
            throw new InvalidAgentDefinitionError('toolMailModule() options must be an object.');
        }

        if (options.env !== undefined && !isObject(options.env)) {
            throw new InvalidAgentDefinitionError('toolMailModule() env must be an object.');
        }

        this.env = options.env ?? process.env;
        this.pinned = options.accounts !== undefined;

        if (options.accounts !== undefined) {
            normalizeAccounts(options.accounts, 'toolMailModule()');
            options.accounts.forEach((account, index) => {
                if (account.smtp !== undefined) {
                    normalizeSmtp(account.smtp, `toolMailModule() accounts[${index}].smtp`);
                }
            });
            this.accounts = options.accounts;
        } else {
            this.accounts = readMailAccountsFromEnv(this.env);
        }
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);

        if (context.mode === 'migrate') {
            return;
        }

        const editable = !this.pinned && container.has(AppToken.CONNECTION_SERVICE);
        const definition = mailConnectionDefinition();
        const loaded = await loadMailAccounts({
            definition,
            declared: this.accounts ?? [],
            pinned: this.pinned,
            env: this.env,
            logger: container.resolve(AppToken.LOGGER),
            rows: this.pinned ? [] : await readStoredConnections(container, MAIL_CONNECTION_TYPE),
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
            createMailClient(loaded.accounts, { clock: container.resolve(AppToken.CLOCK) }) :
            createUnconfiguredMailClient(MAIL_CONNECTION_TYPE);

        const writeClient = loaded.accounts.length > 0 ?
            createMailWriteClient(loaded.accounts, { clock: container.resolve(AppToken.CLOCK) }) :
            createUnconfiguredMailWriteClient(MAIL_CONNECTION_TYPE);

        this.client = client;
        this.writeClient = writeClient;

        container.registerMany(AppToken.LIFECYCLE_HOOKS, {
            useValue: {
                name: this.name,
                engineCreated: (engine) => {
                    provideMailContext(engine, client);
                    provideMailWriteContext(engine, writeClient);
                },
                drained: async () => {
                    await Promise.all([client.close(), writeClient.close()]);
                },
            },
        });
    }

    async teardown(): Promise<void> {
        await Promise.all([this.client?.close(), this.writeClient?.close()]);
    }
}

/** The mail module (`chamvi:tool-mail`); see `ToolMailModule`. */
export function toolMailModule(options?: ToolMailModuleOptions): ToolMailModule {
    return new ToolMailModule(options);
}
