/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { inject } from '@chamvi/core';
import type { IContextProvider, StateSchema, ToolContext } from '@chamvi/core';
import type { IMailClient } from '../client/types.ts';
import { MAIL_CONTEXT } from './constants.ts';

/** Provides `client` to every tool, tools factory and effect hook of the engine's runs (`mailTools()` without accounts). */
export function provideMailContext(provider: IContextProvider, client: IMailClient): void {
    provider.provide(MAIL_CONTEXT, client);
}

/** The mail client provided on the engine; throws ContextNotProvidedError (naming `mail`) without one. */
export function injectMailContext<S extends StateSchema = StateSchema>(ctx: ToolContext<S>): IMailClient {
    return inject(ctx, MAIL_CONTEXT);
}
