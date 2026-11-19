/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import type { RunWire } from '@chamvi/http-kit';
import { Permission } from '@chamvi/access';
import { CANCELABLE_STATUSES, PARENT_LABELS } from '../constants.ts';

/** Cancel shows for a run that can still stop while the session is allowed `chamvi_run_cancel`. */
export function canCancel(run: RunWire, allowed: (name: string) => boolean): boolean {
    return CANCELABLE_STATUSES.includes(run.status) && allowed(Permission.RUN_CANCEL);
}

/**
 * The run this one was dispatched from, with the run page's label; undefined
 * for none or an unknown kind. A peer parent is a run of another app
 * (`remote`, no local page), labelled `from <peer>/<agent>` with the origin
 * name when the peer sent one.
 */
export function parentOf(run: RunWire): {
    runId: string;
    label: string;
    remote?: true
} | undefined {
    const { parent } = run.trigger;

    if (!parent || typeof parent.runId !== 'string') {
        return undefined;
    }

    if (parent.kind === 'peer') {
        const origin = parent.origin !== undefined ? ` (${parent.origin})` : '';

        return {
            runId: parent.runId,
            label: `from ${parent.peer}/${parent.agent}${origin}`,
            remote: true,
        };
    }

    const label = Object.hasOwn(PARENT_LABELS, parent.kind) ? PARENT_LABELS[parent.kind] : undefined;

    return label ? { runId: parent.runId, label } : undefined;
}

/** The tokens of every run below this one (`subtreeUsage`, input plus output); undefined without any. */
export function subtreeTotal(run: RunWire): number | undefined {
    return run.subtreeUsage ? run.subtreeUsage.inputTokens + run.subtreeUsage.outputTokens : undefined;
}

/** The run page's line for a dispatch wait (distinct runs); undefined for any other run. */
export function dispatchCallout(run: RunWire): string | undefined {
    if (run.status !== 'waiting' || run.waiting?.kind !== 'dispatch') {
        return undefined;
    }

    const count = new Set(run.waiting.runIds).size;

    return `Waits for ${count} dispatched ${count === 1 ? 'run' : 'runs'}`;
}

/** The dispatch role a child run was started through, else its subscription id. */
export function childRole(run: RunWire): string {
    return run.trigger.parent?.role ?? run.trigger.trigger;
}

/** The tool a run's wait point paused in; none for a remote wait. */
export function waitToolName(run: RunWire): string | undefined {
    return run.waiting && run.waiting.kind !== 'remote' ? run.waiting.toolName : undefined;
}

/** A remote agent as `<peer>/<agent>`: the peer and the agent's name there. */
export function remoteLabel(remote: { peer: string; agent: string }): string {
    return `${remote.peer}/${remote.agent}`;
}

/** The URL when it is an absolute http(s) URL, else undefined: a peer's link is never rendered otherwise. */
export function httpUrl(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    try {
        const url = new URL(value);

        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
    } catch {
        return undefined;
    }
}

/**
 * The run page's view of a stand-in's remote wait: `<peer>/<agent>`, the
 * remote run id and, while the last poll saw one, the remote approval's title
 * and the peer's link (http(s) only); undefined for any other run.
 */
export function remoteCallout(run: RunWire): {
    target: string;
    remoteRunId: string;
    approval?: { title: string; url?: string };
} | undefined {
    if (run.status !== 'waiting' || run.waiting?.kind !== 'remote') {
        return undefined;
    }

    const { waiting } = run;
    const approval = waiting.remote?.approval;

    return {
        target: remoteLabel(waiting),
        remoteRunId: waiting.remoteRunId,
        ...(approval ? { approval: { title: approval.title, url: httpUrl(approval.url) } } : {}),
    };
}
