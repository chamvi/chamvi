/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import type { ToolContext } from '@chamvi/core';
import { RECONCILE_SKEW_MS } from '../../channel/constants.ts';

/**
 * `<runId>:<tool>:<sha256 of parts>`: one application per run and input,
 * like core's default effect key, but known to `execute`, which embeds its
 * marker in what it creates.
 */
export function inputEffectKey(runId: string, tool: string, parts: unknown[]): string {
    return `${runId}:${tool}:${createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`;
}

/**
 * `since` for a reconcile list: a marker of this run is only in what was
 * updated after the run was received, less RECONCILE_SKEW_MS for clock skew.
 */
export function reconcileSince(ctx: ToolContext): string {
    return new Date(new Date(ctx.run.trigger.receivedAt).getTime() - RECONCILE_SKEW_MS).toISOString();
}
