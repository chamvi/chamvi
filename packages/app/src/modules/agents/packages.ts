/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent } from '@chamvi/core';
import type { AgentIssue } from '@chamvi/http';
import { messageOf, relativize } from '../../loader/helpers.ts';
import { isDevMarkerOf } from '../../package/helpers.ts';
import { loadAgentPackage } from '../../package/module.ts';
import type { LoadedPackage } from '../../package/types.ts';
import { JOB_CONFLICT_HINT } from './constants.ts';
import { nextRetryDelay } from './helpers.ts';
import { registerAgent } from './register.ts';
import type { IPackageAgents, PackageAgentsOptions } from './types.ts';

type Claim = {
    spec: string;
    agent: Agent;
    loaded: LoadedPackage;
};

/**
 * The agent packages of a lifecycle, loaded once at boot (no watcher: a
 * package does not change within a process). Per package in order: resolve,
 * import and build (`loadAgentPackage`), then per agent the clash order
 * (an agent passed in code, then an earlier package, win; the loser is an issue) and
 * `registerAgent` at the package revision. In production a stored dev marker
 * of the same version (`<name>@<version>+<hash>`), in dev the version
 * marker, is moved without a cancel. Static failures are recorded once;
 * failed skill preparations retry with the folder watcher's capped backoff
 * from `start()` until `stop()`.
 */
export function createPackageAgents(options: PackageAgentsOptions): IPackageAgents {
    const {
        specs,
        cwd,
        dev,
        engine,
        codeNames,
        check,
        clock,
        logger,
        pollMs,
        signal,
        role,
        importer,
    } = options;

    // keyed by agent name, `<spec>\0<name>` for a clash, or `<spec>\0` for a package that failed before its agents were known
    const issues = new Map<string, AgentIssue>();
    const errors = new Map<string, unknown>();
    const claims = new Map<string, Claim>();
    const unresolved: string[] = [];
    const conflicts = new Map<string, string>();
    const retries = new Map<string, { delay: number; at: number }>();

    let timer: { clear(): void } | undefined;
    let started = false;
    let stopped = false;
    let inFlight: Promise<void> | undefined;

    const record = (key: string, agent: string, message: string, error?: unknown) => {
        issues.set(key, {
            agent,
            message,
            at: clock.now(),
        });

        if (error !== undefined) {
            errors.set(key, error);
        }

        logger.warn('agent load failed', { agent, message });
    };

    /** Production: a stored dev marker of the loaded version; dev: the version marker. */
    const formerRevisionOf = (name: string, loaded: LoadedPackage) => async (): Promise<string | undefined> => {
        if (dev) {
            return loaded.formerRevision;
        }

        const marker = await engine.store.agentRevisions.findOne(name);

        return marker !== undefined && isDevMarkerOf(marker.hash, loaded.revision) ? marker.hash : undefined;
    };

    const attempt = async (name: string, claim: Claim): Promise<void> => {
        const { spec, loaded } = claim;
        const outcome = await registerAgent({
            engine,
            agent: claim.agent,
            check,
            role,
            revision: loaded.revision,
            formerRevision: formerRevisionOf(name, loaded),
            signal,
        });

        if (outcome.kind === 'registered' || outcome.kind === 'checked') {
            issues.delete(name);
            errors.delete(name);
            retries.delete(name);

            return;
        }

        if (outcome.kind === 'issue') {
            record(name, name, `${name} (${spec}): ${relativize(outcome.message, cwd)}`);

            return;
        }

        if (outcome.kind === 'conflict') {
            const message = `${name} (${spec}): ${outcome.message} ${JOB_CONFLICT_HINT}`;

            conflicts.set(name, message);
            record(name, name, message);

            return;
        }

        if (stopped || signal?.aborted) {
            throw outcome.error;
        }

        const delay = nextRetryDelay(retries.get(name)?.delay, pollMs);

        retries.set(name, { delay, at: clock.now().getTime() + delay });
        record(name, name, `${name} (${spec}): ${relativize(messageOf(outcome.error), cwd)}`, outcome.error);
    };

    const retryDue = async (): Promise<void> => {
        const now = clock.now().getTime();

        for (const [name, retry] of [...retries]) {
            if (stopped) {
                return;
            }

            if (now < retry.at) {
                continue;
            }

            try {
                await attempt(name, claims.get(name)!);
            } catch (error) {
                // the store failed: retried on the next poll
                logger.error('agent reload failed', error, { agent: name });
            }
        }
    };

    const arm = () => {
        if (stopped || retries.size === 0) {
            return;
        }

        timer = clock.setTimeout(() => {
            timer = undefined;
            inFlight = retryDue()
                .catch((error: unknown) => {
                    logger.error('agent packages retry failed', error);
                })
                .finally(() => {
                    inFlight = undefined;
                    arm();
                });
        }, pollMs, { keepAlive: false });
    };

    return {
        async boot() {
            for (const spec of specs) {
                signal?.throwIfAborted();

                let loaded: LoadedPackage;

                try {
                    loaded = await loadAgentPackage(spec, {
                        cwd,
                        dev,
                        ...(importer !== undefined && { importer }),
                    });
                } catch (error) {
                    unresolved.push(spec);
                    // NUL-suffixed: an agent of this name registering later must not delete the package's issue
                    record(`${spec}\0`, spec, relativize(messageOf(error), cwd), error);

                    continue;
                }

                for (const agent of loaded.agents) {
                    const { name } = agent;

                    if (codeNames.has(name)) {
                        record(`${spec}\0${name}`, name, `${name}: a code agent has this name; package ${spec} is not loaded.`);

                        continue;
                    }

                    const earlier = claims.get(name);

                    if (earlier !== undefined) {
                        record(`${spec}\0${name}`, name, `${name}: package ${earlier.spec} already provides this agent; package ${spec} is not loaded.`);

                        continue;
                    }

                    const claim = {
                        spec,
                        agent,
                        loaded,
                    };

                    // reserved against folders from here on, also when a later step fails
                    claims.set(name, claim);
                    await attempt(name, claim);
                }
            }
        },
        start() {
            if (started || stopped) {
                return;
            }

            started = true;
            arm();
        },
        async stop() {
            stopped = true;
            timer?.clear();
            timer = undefined;
            await inFlight;
        },
        async idle() {
            await inFlight;
        },
        reserved() {
            return new Map([...claims].map(([name, claim]) => [
                name,
                `${name}: package ${claim.spec} provides this agent; the folder is not loaded.`,
            ]));
        },
        unresolved() {
            return [...unresolved];
        },
        conflict(name) {
            return conflicts.get(name);
        },
        failure(name) {
            const issue = claims.has(name) ? issues.get(name) : undefined;

            if (issue === undefined) {
                return undefined;
            }

            return {
                message: issue.message,
                ...(errors.has(name) && { error: errors.get(name) }),
            };
        },
        issues() {
            return issues.values().toArray().map((issue) => ({ ...issue }));
        },
    };
}
