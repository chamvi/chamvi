/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    InvalidAgentDefinitionError,
    InvalidRunStateError,
    assertConnectionName,
    createConnectionVault,
} from '@chamvi/core';
import type {
    ChannelSubscription,
    ConversationRef,
    IConnectionHandle,
} from '@chamvi/core';
import {
    AppToken,
    ModuleName,
    approvalUrlOf,
} from '@chamvi/app';
import type { IContainer, ILogger, IModule } from '@chamvi/app';
import type {
    ChatApprovalRef,
    ChatChannel,
    ChatSubscriptionOptions,
    ChatTarget,
} from '@chamvi/chat';
import { isObject } from 'smob';
import { createStoreWhatsAppAuth } from '../auth/module.ts';
import { createWhatsAppChat } from '../whatsapp/module.ts';
import type {
    IWhatsAppAuthProvider,
    WhatsAppChatSetup,
    WhatsAppConnectionStatus,
    WhatsAppConversationInput,
} from '../whatsapp/types.ts';
import { createWhatsAppHandle } from './helpers.ts';
import type { WhatsAppModuleOptions } from './types.ts';

function invalid(message: string): InvalidAgentDefinitionError {
    return new InvalidAgentDefinitionError(`whatsappModule: ${message}`);
}

/**
 * WhatsApp as an app module, its session in the app store: the channel, its
 * Chat and the connection handle are built when the factory is called
 * (nothing is read, acquired or connected), so agents subscribe with
 * `module.on()`. `setup` (start mode, a check included) resolves the keyring
 * (`CHAMVI_ENCRYPTION_KEYS`, failing setup naming it), builds the connection
 * vault over `AppToken.STORE` and the app clock, and contributes the channel
 * to `AppToken.CHANNELS` and the handle to `AppToken.CONNECTIONS`; a job
 * contributes the channel only (its subscriptions validate, the engine never
 * starts it), migrate nothing. The lease is taken only when the engine
 * starts the channel, so a check, a job and a migration acquire and write
 * nothing. The handle shows the latest QR while pairing, to the
 * dashboard's `connection:<name>:write` holders only; nothing logs it.
 */
export class WhatsAppModule implements IModule {
    readonly name: string;

    readonly dependencies = [ModuleName.CONFIG, ModuleName.STORE];

    /** The channel the module contributes. */
    readonly channel: ChatChannel;

    /** The connection handle the module contributes (the dashboard's view). */
    readonly handle: IConnectionHandle;

    protected options: WhatsAppModuleOptions;

    protected setupValue: WhatsAppChatSetup;

    protected auth?: IWhatsAppAuthProvider;

    protected approvalUrl?: (ref: ChatApprovalRef) => string;

    protected logger?: ILogger;

    constructor(options: WhatsAppModuleOptions) {
        if (!isObject(options)) {
            throw invalid('options must be an object.');
        }

        try {
            assertConnectionName(options.connection);
        } catch (error) {
            throw invalid(`connection: ${(error as Error).message}`);
        }

        if (options.leaseTtlMs !== undefined && (!Number.isSafeInteger(options.leaseTtlMs) || options.leaseTtlMs < 3)) {
            throw invalid('leaseTtlMs must be an integer of at least 3.');
        }

        this.options = options;

        const chatOptions: Partial<WhatsAppModuleOptions> = { ...options };

        delete chatOptions.connection;
        delete chatOptions.leaseTtlMs;
        delete chatOptions.approvalUrl;

        let handle: ReturnType<typeof createWhatsAppHandle> | undefined;

        this.setupValue = createWhatsAppChat({
            ...chatOptions as Omit<WhatsAppModuleOptions, 'connection' | 'leaseTtlMs' | 'approvalUrl'>,
            // the store provider exists once setup has the store and the keyring
            auth: {
                acquire: (signal, acquireOptions) => {
                    if (!this.auth) {
                        return Promise.reject(new InvalidRunStateError('whatsappModule: the channel started before the module was set up (or in a job).'));
                    }

                    return this.auth.acquire(signal, acquireOptions);
                },
            },
            approvalUrl: (ref) => this.approvalUrl!(ref),
            onPairing: (pairing) => handle?.onPairing(pairing),
            onStatus: (status: WhatsAppConnectionStatus) => handle?.onStatus(status),
            onError: options.onError ?? ((error: unknown) => this.report(error)),
        });
        handle = createWhatsAppHandle({
            name: options.connection,
            status: () => this.setupValue.status(),
            reset: () => this.setupValue.reset(),
            onError: (error) => this.report(error),
        });
        this.handle = handle.handle;
        this.channel = this.setupValue.channel;
        this.name = `chamvi:channel:${this.channel.name}`;
    }

    /** A subscription of this channel (as `chat.on()`). */
    on(options?: ChatSubscriptionOptions): ChannelSubscription {
        return this.channel.on(options);
    }

    /** The address of a chat of this channel. */
    to(target: ChatTarget): string {
        return this.channel.to(target);
    }

    /** See WhatsAppChatSetup.conversation(). */
    conversation(input: WhatsAppConversationInput): ConversationRef {
        return this.setupValue.conversation(input);
    }

    /** See WhatsAppChatSetup.status(). */
    status(): WhatsAppConnectionStatus {
        return this.setupValue.status();
    }

    /** See WhatsAppChatSetup.reset(). */
    reset(): Promise<void> {
        return this.setupValue.reset();
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);

        if (context.mode === 'migrate') {
            return;
        }

        this.logger = container.resolve(AppToken.LOGGER);

        const approvalUrl = this.options.approvalUrl ?? approvalUrlOf(container.resolve(AppToken.CONFIG));

        if (!approvalUrl) {
            throw invalid('approvalUrl is required, or CHAMVI_PUBLIC_URL for the dashboard\'s approvals page.');
        }

        this.approvalUrl = approvalUrl;

        if (context.mode === 'start') {
            const vault = createConnectionVault({
                store: container.resolve(AppToken.STORE),
                keyring: container.resolve(AppToken.KEYRING),
                clock: container.resolve(AppToken.CLOCK),
            });

            this.auth = createStoreWhatsAppAuth({
                vault,
                connection: this.options.connection,
                ...(this.options.leaseTtlMs !== undefined ? { leaseTtlMs: this.options.leaseTtlMs } : {}),
            });
            container.registerMany(AppToken.CONNECTIONS, { useValue: this.handle });
        }

        container.registerMany(AppToken.CHANNELS, { useValue: this.channel });
    }

    protected report(error: unknown): void {
        if (this.logger) {
            this.logger.error('whatsapp error', error, { connection: this.options.connection });

            return;
        }

        // eslint-disable-next-line no-console
        console.error('[chamvi]', error);
    }
}

/** The WhatsApp channel module: `whatsappModule({ connection, account, policy, ... })`. */
export function whatsappModule(options: WhatsAppModuleOptions): WhatsAppModule {
    return new WhatsAppModule(options);
}
