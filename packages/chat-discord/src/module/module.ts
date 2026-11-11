/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    ConnectionNotConfiguredError,
    InvalidAgentDefinitionError,
    assertConnectionName,
    resolveConnection,
} from '@chamvi/core';
import type {
    ChannelSubscription,
    ConnectionTypeDefinition,
    ConversationRef,
    IChannel,
    ResolvedConnection,
} from '@chamvi/core';
import {
    AppToken,
    ModuleName,
    approvalUrlOf,
    envSecret,
    readStoredConnections,
} from '@chamvi/app';
import type {
    Env,
    IContainer,
    ILogger,
    IModule,
    StoredConnection,
} from '@chamvi/app';
import { chatAddress, createChatSubscription } from '@chamvi/chat';
import type { ChatSubscriptionOptions, ChatTarget } from '@chamvi/chat';
import { isObject } from 'smob';
import { DISCORD_ADAPTER_NAME } from '../discord/constants.ts';
import { createDiscordChat } from '../discord/module.ts';
import { resolvePolicy, toConversationRef } from '../discord/policy.ts';
import type {
    DiscordChatOptions,
    DiscordChatSetup,
    DiscordConnectionStatus,
    DiscordConversationInput,
} from '../discord/types.ts';
import { DISCORD_CONNECTION_TYPE, DISCORD_MODULE_NAME } from './constants.ts';
import {
    assertEnvFormat,
    createDiscordHandle,
    policyOf,
    presetOf,
} from './helpers.ts';
import { declaredConnection, discordConnectionDefinition } from './type.ts';
import type { DiscordInstances, DiscordModuleOptions } from './types.ts';

/** One list of the Discord modules' connections per app, behind one provider. */
const INSTANCES = new WeakMap<IContainer, DiscordInstances>();

function invalid(message: string): InvalidAgentDefinitionError {
    return new InvalidAgentDefinitionError(`discordModule: ${message}`);
}

/**
 * A Discord bot as an app module, configured from `options`, env or the
 * connection store. `setup` resolves the connection and contributes its
 * channel, named after the module; agents subscribe before that with
 * `module.on()`. A not configured module contributes an idle channel, so
 * subscribed agents can start: it never logs in and its `out` throws
 * ConnectionNotConfiguredError. A stored value the channel refuses leaves it
 * idle too (`incomplete`), for the dashboard to repair. Only the engine's
 * start logs in, so a check connects to nothing. Migrate mode does nothing.
 */
export class DiscordModule implements IModule {
    readonly name: string;

    readonly dependencies = [ModuleName.CONFIG, ModuleName.STORE];

    /** The instance name: connection, channel, account and env prefix. */
    protected connection: string;

    protected env: Env;

    protected options: DiscordModuleOptions;

    protected chat: DiscordChatSetup | undefined;

    protected handle: ReturnType<typeof createDiscordHandle> | undefined;

    constructor(options: DiscordModuleOptions) {
        if (!isObject(options)) {
            throw invalid('options must be an object.');
        }

        const name = options.name ?? DISCORD_CONNECTION_TYPE;

        try {
            assertConnectionName(name);
        } catch (error) {
            throw invalid(`name: ${(error as Error).message}`);
        }

        // `<x>-dm` + USERS is the variable of `<x>` + DM_USERS (`dm`: the default instance's)
        if (name === 'dm' || name.endsWith('-dm')) {
            throw invalid('name must not be `dm` or end in `-dm`: its USERS variable would be another instance\'s DM allowlist.');
        }

        if (options.env !== undefined && !isObject(options.env)) {
            throw invalid('env must be an object.');
        }

        for (const key of ['token', 'applicationId'] as const) {
            if (options[key] !== undefined && (typeof options[key] !== 'string' || options[key].length === 0)) {
                throw invalid(`${key} must be a non-empty string.`);
            }
        }

        if (typeof options.resolveInvoker !== 'function') {
            throw invalid('resolveInvoker must be a function.');
        }

        if (!isObject(options.state)) {
            throw invalid('state must be a Chat SDK StateAdapter.');
        }

        if (options.approvalUrl !== undefined && typeof options.approvalUrl !== 'function') {
            throw invalid('approvalUrl must be a function.');
        }

        if (options.policy !== undefined) {
            resolvePolicy(options.policy);
        }

        this.connection = name;
        this.name = `${DISCORD_MODULE_NAME}:${name}`;
        this.env = options.env ?? process.env;
        this.options = options;

        assertEnvFormat(discordConnectionDefinition(), name, this.env, presetOf(options));
    }

    /** A subscription of this channel (as `chat.on()`). */
    on(options?: ChatSubscriptionOptions): ChannelSubscription {
        return createChatSubscription(this.connection, options, [DISCORD_ADAPTER_NAME]);
    }

    /** The address of a chat of this channel. */
    to(target: ChatTarget): string {
        return chatAddress(target);
    }

    /** See DiscordChatSetup.conversation(). */
    conversation(input: DiscordConversationInput): ConversationRef {
        return toConversationRef(input, {
            account: this.connection,
            channel: this.connection,
            address: (threadId) => this.to({ adapter: DISCORD_ADAPTER_NAME, threadId }),
        });
    }

    /** The Gateway connection's state; `stopped` while idle. */
    status(): DiscordConnectionStatus {
        return this.chat?.status() ?? 'stopped';
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);

        if (context.mode === 'migrate') {
            return;
        }

        const logger = container.resolve(AppToken.LOGGER);

        const handle = createDiscordHandle({
            name: this.connection,
            status: () => this.status(),
            onError: (error) => logger.error('discord error', error, { connection: this.connection }),
        });

        this.handle = handle;

        const pinned = this.isPinned();
        const editable = !pinned && container.resolve(AppToken.STORE).connections !== undefined;
        const row = pinned ? undefined : await this.readRow(container);

        let resolved = this.resolve(row);

        if (resolved.state === 'configured') {
            try {
                this.chat = this.build(container, resolved, logger);
            } catch (error) {
                const fromStore = Object.values(resolved.sources).some((source) => source.kind === 'store');

                // only a stored value can be repaired in the dashboard
                if (!fromStore || !(error instanceof InvalidAgentDefinitionError)) {
                    throw error;
                }

                // these messages name the option, never a value
                logger.warn(`The Discord connection "${this.connection}" cannot be used (${error.message}); it stays idle until it is repaired.`);
                resolved = {
                    ...resolved, 
                    state: 'incomplete', 
                    reason: error.message, 
                };
            }
        } else {
            logger.warn(`The Discord connection "${this.connection}" is ${resolved.state.replace('_', ' ')}; it stays idle until it is configured.`);
        }

        this.declare(container, {
            ...declaredConnection(this.connection, resolved, editable, row),
            // the shared provider's type closes over the first module's options: this one tests its own
            test: this.definition().test,
        });

        const channel: IChannel = this.chat?.channel ?? {
            name: this.connection,
            out: () => Promise.reject(new ConnectionNotConfiguredError(this.connection)),
        };

        container.registerMany(AppToken.CHANNELS, { useValue: channel });

        // an idle module has no connection to report; a job serves no dashboard
        if (this.chat && context.mode === 'start') {
            container.registerMany(AppToken.CONNECTIONS, { useValue: handle });
        }
    }

    /** Every field comes from code: nothing is left for env or the store to set. */
    protected isPinned(): boolean {
        const {
            token,
            applicationId,
            policy,
        } = this.options;

        return token !== undefined && applicationId !== undefined && policy !== undefined;
    }

    protected async readRow(container: IContainer): Promise<StoredConnection | undefined> {
        const [row] = await readStoredConnections(container, DISCORD_CONNECTION_TYPE, { name: this.connection });

        return row;
    }

    protected resolve(row: StoredConnection | undefined): ResolvedConnection {
        const resolved = resolveConnection({
            definition: discordConnectionDefinition(),
            name: this.connection,
            readVariable: (variable) => envSecret(this.env, variable),
            preset: presetOf(this.options),
            ...(row && { stored: row.values }),
        });
        const onlyCode = Object.values(resolved.sources).every((source) => source.kind === 'code' || source.kind === 'unset');

        // options in code alone are no attempt to configure the bot: env and the store are still empty
        return resolved.state === 'incomplete' && onlyCode ? { ...resolved, state: 'not_configured' } : resolved;
    }

    protected build(container: IContainer, resolved: ResolvedConnection, logger: ILogger): DiscordChatSetup {
        const approvalUrl = this.options.approvalUrl ?? approvalUrlOf(container.resolve(AppToken.CONFIG));

        if (!approvalUrl) {
            throw invalid('approvalUrl is required, or CHAMVI_PUBLIC_URL for the dashboard\'s approvals page.');
        }

        const chatOptions: Partial<DiscordModuleOptions> = { ...this.options };

        for (const key of ['env', 'token', 'applicationId', 'policy', 'approvalUrl'] as const) {
            delete chatOptions[key];
        }

        const { values } = resolved;
        const options: DiscordChatOptions = {
            ...chatOptions as Omit<DiscordModuleOptions, 'env' | 'token' | 'applicationId' | 'policy' | 'approvalUrl'>,
            name: this.connection,
            account: this.connection,
            token: async () => values.token as string,
            applicationId: values.applicationId as string,
            policy: this.options.policy ?? policyOf(values),
            approvalUrl,
            onStatusChange: () => {
                try {
                    this.options.onStatusChange?.();
                } finally {
                    // the dashboard's stream follows the status even when the app's callback throws
                    this.handle?.notify();
                }
            },
            onError: this.options.onError ?? ((error) => logger.error('discord error', error, { connection: this.connection })),
        };

        return createDiscordChat(options);
    }

    /** The connection type with this module's API endpoint and fetch. */
    protected definition(): ConnectionTypeDefinition {
        return discordConnectionDefinition({
            ...(this.options.apiUrl !== undefined && { apiUrl: this.options.apiUrl }),
            ...(this.options.fetch !== undefined && { fetch: this.options.fetch }),
        });
    }

    /** One provider for every module, whichever is set up first. */
    protected declare(container: IContainer, connection: DiscordInstances['connections'][number]): void {
        let instances = INSTANCES.get(container);

        if (!instances) {
            const created: DiscordInstances = { connections: [] };

            instances = created;
            INSTANCES.set(container, created);
            container.registerMany(AppToken.CONNECTION_TYPES, {
                useValue: {
                    definition: this.definition(),
                    creatable: () => false,
                    connections: () => created.connections,
                },
            });
        }

        instances.connections.push(connection);
    }
}

/**
 * The Discord channel module: `name` (default `discord`) names its connection,
 * channel, account and env prefix. See `DiscordModule`.
 */
export function discordModule(options: DiscordModuleOptions): DiscordModule {
    return new DiscordModule(options);
}
