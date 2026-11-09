/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { inject } from '@chamvi/core';
import type { IContextProvider, StateSchema, ToolContext } from '@chamvi/core';
import type { IGithubApp } from '../app/types.ts';
import { GITHUB_CONTEXT } from './constants.ts';
import type { IGithubAppResolver } from './types.ts';

/** Provides `app` to every tool, tools factory and effect hook of the engine's runs, for every agent. */
export function provideGithubContext(provider: IContextProvider, app: IGithubApp): void {
    provider.provide(GITHUB_CONTEXT, { appFor: () => app });
}

/** Provides a per-agent App resolver: what `githubModule()` uses, for several Apps on one engine. */
export function provideGithubAppResolver(provider: IContextProvider, resolver: IGithubAppResolver): void {
    provider.provide(GITHUB_CONTEXT, resolver);
}

/** The GitHub App of the run's agent; throws ContextNotProvidedError (naming `github`) without one. */
export function injectGithubContext<S extends StateSchema = StateSchema>(ctx: ToolContext<S>): IGithubApp {
    return inject(ctx, GITHUB_CONTEXT).appFor(ctx.run.agent);
}
