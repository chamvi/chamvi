/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent } from '@chamvi/core';

/** An agent package, resolved, hashed and imported. */
export type LoadedPackage = {
    /** The specifier as listed (`@acme/agents`, `@acme/agents/triage`). */
    spec: string;
    /** The package name (`package.json` `name`). */
    name: string;
    /** The package version (`package.json` `version`). */
    version: string;
    /** The package's root folder, its real path (a symlinked workspace package resolved). */
    root: string;
    /**
     * The revision its agents are registered at: `<name>@<version>`, in dev
     * `<name>@<version>+<12 hex of hashAgentPackage(root, { entry })>`.
     */
    revision: string;
    /** Dev only: the production marker `<name>@<version>`, moved to the dev marker without a cancel. */
    formerRevision?: string;
    /** The agents of its default export (or of what its factory returned), rebuilt through this copy's defineAgent(). */
    agents: Agent[];
};

export type LoadAgentPackageOptions = {
    /** The folder the specifier resolves from (the app's working directory). */
    cwd: string;
    /** Dev markers (`start --dev`): the version plus the content hash. */
    dev?: boolean;
    /** Imports the entry by file URL. Default: a native `import()` with the app's packages pinned. */
    importer?: (url: string) => Promise<unknown>;
    /**
     * The user conditions resolved before `node` and `import`. Default: this
     * process's (`--conditions`/`-C` in `execArgv` and `NODE_OPTIONS`), as
     * Node's own resolution uses them.
     */
    conditions?: readonly string[];
};

export type HashAgentPackageOptions = {
    /**
     * The resolved entry file, absolute. Its top-level folder below the root
     * (or the file itself at the root) is hashed too, also outside `files`:
     * a linked workspace package may export its source while `files` names
     * the build output.
     */
    entry?: string;
};

/** createApp's agent entries split into code agents and package specifiers. */
export type AgentEntries = {
    agents: Agent[];
    packages: string[];
};
