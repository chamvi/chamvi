/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from '@chamvi/errors';
import type { ToolContext } from '@chamvi/core';
import { isObject } from 'smob';
import { hasChannel, isChannelOf } from '../../app/helpers/index.ts';
import type { IGithubApp } from '../../app/types.ts';
import { GITHUB_CHANNEL_NAME } from '../../channel/constants.ts';
import { GITHUB_REQUEST_ERROR_CODE } from '../constants.ts';
import type { RepoTarget } from '../types.ts';

/**
 * Whether the run came from a delivery of this App: its own channels, so a
 * delivery of another App never chooses the installation; the literal
 * `github` name only for a standalone App no channel was made for.
 */
function isGithubRun(ctx: ToolContext, app: IGithubApp): boolean {
    const { channel } = ctx.run.trigger;

    return hasChannel(app) ? isChannelOf(app, channel) : channel === GITHUB_CHANNEL_NAME;
}

/** The delivery's installation of a run a GitHub channel of this app started, else undefined. */
function eventInstallation(ctx: ToolContext, app: IGithubApp): { id: number; repository?: string } | undefined {
    const { payload } = ctx.run.trigger;

    if (!isGithubRun(ctx, app) || !isObject(payload) || typeof payload.installationId !== 'number') {
        return undefined;
    }

    const event = isObject(payload.payload) ? payload.payload : {};
    const repository = isObject(event.repository) && typeof event.repository.full_name === 'string' ?
        event.repository.full_name :
        undefined;

    return { id: payload.installationId, ...(repository ? { repository } : {}) };
}

/**
 * The installation a tool acts as for `target`: (1) the delivery's for a
 * run a GitHub channel of this app started (any name a
 * githubChannel({ app }) took, `github` for an App without one) on the same repository (compared
 * case-insensitively, no request); (2) the App's installation on the
 * repository (`app.installationFor`); (3) the delivery's installation for
 * any repository, else the app's `installationId`, so a public repository
 * the App is not installed on is still readable. A payload of another
 * channel never chooses the installation, since its caller could name any.
 * Without `target` only (3). Without any, a `github_request` ChamviError (a
 * tool error, never a FatalToolError, since every GitHub tool of the run
 * would fail).
 */
export async function installationOf(app: IGithubApp, ctx: ToolContext, target?: RepoTarget): Promise<number> {
    const event = eventInstallation(ctx, app);

    if (target) {
        const name = `${target.owner}/${target.repo}`.toLowerCase();

        if (event?.repository?.toLowerCase() === name) {
            return event.id;
        }

        const found = await app.installationFor(target);

        if (found !== undefined) {
            return found;
        }
    }

    if (event) {
        return event.id;
    }

    if (app.installationId !== undefined) {
        return app.installationId;
    }

    const where = target ? ` on ${target.owner}/${target.repo}` : '';
    throw new ChamviError({
        code: GITHUB_REQUEST_ERROR_CODE,
        message: `The GitHub App is not installed${where} and the run has no default installation ` +
            '(start it from a GitHub delivery or set installationId on createGithubApp()).',
    });
}
