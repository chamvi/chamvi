/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Env } from '@chamvi/app';
import type { DeclaredConnection, IEngine } from '@chamvi/core';
import type { GithubAppOptions, IGithubApp } from '../app/types.ts';
import type { GithubChannelOptions } from '../channel/types.ts';
import type { GithubAppCredentialsOptions } from '../credentials/types.ts';

/** `githubChannel()` options; `approvalUrl` defaults to the UI link from `CHAMVI_PUBLIC_URL`, `clock` is the app's. */
export type GithubModuleChannelOptions = Omit<GithubChannelOptions, 'app' | 'clock'>;

export type GithubModuleOptions = Partial<GithubAppOptions> & {
    /**
     * The instance's name (agent-name rule), default `github`: its stored
     * connection, the default channel name and the env prefix
     * (`CHAMVI_GITHUB_<NAME>_*`; the default instance keeps `GITHUB_*`).
     */
    name?: string;
    /**
     * The agents this module serves. Without it the module is the fallback
     * for every agent no other module targets; at most one module may omit it.
     */
    agents?: readonly string[];
    /** Used as is; no env is read then, the connection is listed but not editable. */
    app?: IGithubApp;
    /** Default `process.env`, read when the factory is called; format errors throw there, a missing value in `setup`. */
    env?: Env;
    /** The channel's options; named comment slots use the app store's locks by default. */
    channel?: GithubModuleChannelOptions;
    /**
     * The App's git credentials (`githubAppCredentials()`), contributed to
     * `AppToken.GIT_CREDENTIALS` for `sandboxModule()`'s workspaces once
     * configured; `false` contributes none. Default on for the fallback
     * module; a module with `agents` contributes only when this is set.
     */
    credentials?: false | GithubAppCredentialsOptions;
};

/** The createGithubApp options env and the store can set; one variable and form field each. */
export type GithubEnvOption = 'appId' | 'privateKey' | 'webhookSecret' | 'installationId' | 'slug' | 'baseUrl';

/** One module's part in the shared collection. */
export type GithubInstance = {
    name: string;
    app: IGithubApp;
    channelName: string;
    agents?: readonly string[];
    /** Set once the instance's connection is resolved. */
    connection?: DeclaredConnection;
};

/** The GitHub modules of one app; `provided` guards the resolver per engine. */
export type GithubInstances = {
    list: GithubInstance[];
    provided: WeakSet<IEngine>;
};
