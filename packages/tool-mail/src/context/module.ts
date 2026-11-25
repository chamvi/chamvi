/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { inject } from '@chamvi/core';
import type { IContextProvider, StateSchema, ToolContext } from '@chamvi/core';
import type { IMailClient } from '../client/types.ts';
import type { IMailWriteClient } from '../write-client/types.ts';
import { MAIL_CONTEXT, MAIL_WRITE_CONTEXT } from './constants.ts';

/** Provides `client` to every tool, tools factory and effect hook of the engine's runs (`mailTools()` without accounts). */
export function provideMailContext(provider: IContextProvider, client: IMailClient): void {
    provider.provide(MAIL_CONTEXT, client);
}

/** The mail client provided on the engine; throws ContextNotProvidedError (naming `mail`) without one. */
export function injectMailContext<S extends StateSchema = StateSchema>(ctx: ToolContext<S>): IMailClient {
    return inject(ctx, MAIL_CONTEXT);
}

/** Provides the write `client` to every tool and effect hook of the engine's runs (`mailWriteTools()` without accounts). */
export function provideMailWriteContext(provider: IContextProvider, client: IMailWriteClient): void {
    provider.provide(MAIL_WRITE_CONTEXT, client);
}

/** The mail write client provided on the engine; throws ContextNotProvidedError (naming `mail-write`) without one. */
export function injectMailWriteContext<S extends StateSchema = StateSchema>(ctx: ToolContext<S>): IMailWriteClient {
    return inject(ctx, MAIL_WRITE_CONTEXT);
}
