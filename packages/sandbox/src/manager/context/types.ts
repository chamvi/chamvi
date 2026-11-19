/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IWorkspace } from '../../workspace/types.ts';

/** One workspace slot of a run: keyed by the normalized repository URL, or '' without one. */
export type WorkspaceEntry = {
    key: string;
    ref?: string;
    /** The image asked for, else (once created or found) the one the workspace runs. */
    image?: string;
    workspace?: IWorkspace;
    /** Set while the provider creates the workspace; a pending entry counts toward the cap. */
    pending?: Promise<IWorkspace>;
    /** Aborts the create in flight (combined with the caller's signal); release and close abort it. */
    abort?: AbortController;
};

/**
 * What `pick` answers when only a lookup can tell: the run holds no
 * workspace that fits, or one of its workspaces went gone. `gone` are the
 * workspaces to report when the lookup finds nothing either.
 */
export type WorkspaceMiss = { miss: true; gone: IWorkspace[] };
