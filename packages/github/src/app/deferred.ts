/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { ChamviError, ConnectionNotConfiguredError, ErrorCode } from '@chamvi/core';
import { normalizeProposals } from '../tools/proposals.ts';
import { buildReadTools, buildWriteTools } from './tools.ts';
import type {
    DeferredGithubAppOptions,
    GithubOctokit,
    GithubRepositoryToken,
    GithubWriteToolsOptions,
    IDeferredGithubApp,
    IGithubApp,
} from './types.ts';

/**
 * An `IGithubApp` whose real App arrives later (`bind`), possibly never:
 * until then every use throws ConnectionNotConfiguredError (for an `agent`
 * no connection serves, a ChamviError of the same code naming the agent),
 * which tools turn into a tool error; reaching the object is fine. The tool
 * sets are built on the facade, so they work when built before the App is
 * bound.
 */
export function createDeferredGithubApp(options: DeferredGithubAppOptions): IDeferredGithubApp {
    const proposals = normalizeProposals(options.proposals);
    let target: IGithubApp | undefined;

    function resolved(): IGithubApp {
        if (!target) {
            throw 'connection' in options ?
                new ConnectionNotConfiguredError(options.connection) :
                new ChamviError({
                    message: `No GitHub connection is available to the agent "${options.agent}": no GitHub module lists it in agents and none serves every agent.`,
                    code: ErrorCode.CONNECTION_NOT_CONFIGURED,
                });
        }

        return target;
    }

    const app: IDeferredGithubApp = {
        get appId() {
            return resolved().appId;
        },
        get installationId() {
            return resolved().installationId;
        },
        get configured() {
            return target !== undefined;
        },
        bind(value: IGithubApp) {
            target = value;
        },
        async octokit(id: number): Promise<GithubOctokit> {
            return resolved().octokit(id);
        },
        async botLogin() {
            return resolved().botLogin();
        },
        async botIdentity() {
            return resolved().botIdentity();
        },
        async repositoryToken(repository, tokenOptions): Promise<GithubRepositoryToken | undefined> {
            return resolved().repositoryToken(repository, tokenOptions);
        },
        async installationFor(repository) {
            return resolved().installationFor(repository);
        },
        async repositoryInstallation(repository) {
            return resolved().repositoryInstallation(repository);
        },
        async installations() {
            return resolved().installations();
        },
        verifySignature(body: Uint8Array, signature: string | null): boolean {
            return resolved().verifySignature(body, signature);
        },
        readTools(): ToolSet {
            return buildReadTools(app);
        },
        writeTools(toolsOptions?: GithubWriteToolsOptions): ToolSet {
            return buildWriteTools(app, proposals, toolsOptions);
        },
    };

    return app;
}

/** False only for a deferred App that was never bound. */
export function isGithubAppConfigured(app: IGithubApp): boolean {
    return (app as Partial<IDeferredGithubApp>).configured !== false;
}
