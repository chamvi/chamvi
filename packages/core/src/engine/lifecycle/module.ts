/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent } from '../../agent/types.ts';
import type { IChannel } from '../../channel/types.ts';
import { RunStatus } from '@chamvi/store';
import { InvalidRunStateError } from '../../errors/index.ts';
import { untilAborted } from '../../run/helpers.ts';
import { DEFAULT_DRAIN_TIMEOUT_MS } from '../constants.ts';
import type { EngineStartOptions } from '../types.ts';
import type { EngineLifecycleContext, IEngineLifecycle } from './types.ts';

export class EngineLifecycle implements IEngineLifecycle {
    protected readonly ctx: EngineLifecycleContext;

    /** Channels started by the last start(), until a drain() or stop() stops them. */
    protected startedChannels: IChannel<any, any>[] = [];

    /** The stop of the channels started last, shared by drain() and stop(). */
    protected stoppingChannels: Promise<void> | undefined;

    protected started = false;

    protected draining = false;

    protected readonly preparing = new Set<Promise<void>>();

    protected preparationController = new AbortController();

    protected startup?: {
        controller: AbortController;
        signal: AbortSignal;
        done: Promise<void>
    };

    protected stopping?: Promise<void>;

    constructor(ctx: EngineLifecycleContext) {
        this.ctx = ctx;
    }

    isStarted(): boolean {
        return this.started;
    }

    isDraining(): boolean {
        return this.draining;
    }

    isStartAborted(): boolean {
        return this.startup?.signal.aborted === true;
    }

    preparationSignal(): AbortSignal {
        return this.preparationController.signal;
    }

    /** Prepare registered agents and optional candidates without registering or writing to the store. */
    prepare(options: { signal?: AbortSignal; agents?: readonly Agent[] } = {}): Promise<void> {
        if (this.stopping) {
            return this.stopping.then(() => this.ctx.engine.prepare(options));
        }

        if (this.preparationController.signal.aborted) {
            this.preparationController = new AbortController();
        }

        const signal = AbortSignal.any([this.preparationController.signal, ...(options.signal ? [options.signal] : [])]);

        const run = async () => {
            signal.throwIfAborted();

            const agents = [...new Set([...this.ctx.listAgents(), ...(options.agents ?? [])])];

            await this.ctx.skills.prepare(agents, { signal });
        };

        const done = Promise.try(async () => {
            // Keep external provider code deferred until ownership is registered.
            await Promise.resolve();

            return run();
        });

        this.preparing.add(done);
        void done.then(() => this.preparing.delete(done), () => this.preparing.delete(done));

        return done;
    }

    /**
     * Recovers abandoned runs, starts every channel (in registration order,
     * unless `channels: false`), then starts executing queued runs and
     * polling. A throwing channel start rejects after the channels already
     * started were stopped and polling stopped. A call while another start
     * is in flight joins it; its `signal` then only rejects that call, the
     * joined start goes on (only its own caller's signal or stop() cancel it).
     */
    start(options: EngineStartOptions = {}): Promise<void> {
        if (this.stopping) {
            return this.stopping.then(() => this.ctx.engine.start(options));
        }

        if (this.startup && !this.startup.controller.signal.aborted) {
            // A joining caller's signal only ends its own wait: the attempt belongs to the caller that began it.
            return options.signal ? untilAborted(this.startup.done, options.signal) : this.startup.done;
        }

        if (this.startup) {
            return this.startup.done.catch(() => {}).then(() => this.ctx.engine.start(options));
        }

        if (options.signal?.aborted) {
            return Promise.reject(options.signal.reason);
        }

        if (this.started) {
            return Promise.resolve();
        }

        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, ...(options.signal ? [options.signal] : [])]);
        const attempt = {
            controller,
            signal,
            done: Promise.resolve(),
        };

        attempt.done = Promise.try(async () => {
            // Publish the attempt before preparation can invoke external code.
            await Promise.resolve();

            try {
                signal.throwIfAborted();
                await this.ctx.engine.prepare({ signal });
                signal.throwIfAborted();
                this.draining = false;
                this.started = true;
                this.ctx.queue.resume();
                // Verification failures above propagate; ordinary recovery keeps its existing reporting behavior.
                await this.ctx.engine.recover().catch((error: unknown) => this.ctx.onError(error));
                signal.throwIfAborted();

                if (options.channels ?? true) {
                    await this.startChannels(signal);
                }

                signal.throwIfAborted();
                this.ctx.queue.startPolling();
                await this.ctx.queue.pump();
                signal.throwIfAborted();
            } catch (error) {
                this.started = false;
                await this.ctx.queue.halt();
                await this.stopChannels();

                throw error;
            } finally {
                if (this.startup === attempt) {
                    this.startup = undefined;
                }
            }
        });

        this.startup = attempt;

        return attempt.done;
    }

    /** Abort admission immediately, then join actual provider and channel work before returning. */
    stop(): Promise<void> {
        if (this.stopping) {
            return this.stopping;
        }

        this.started = false;

        const admission = this.ctx.queue.halt();

        this.preparationController.abort();
        this.startup?.controller.abort();

        const startup = this.startup?.done;

        const done = (async () => {
            if (startup) {
                await startup.catch(() => {});
            }

            while (this.preparing.size) {
                await Promise.allSettled([...this.preparing]);
            }

            await admission;
            await this.stopChannels();
        })();

        this.stopping = done;

        void done.then(() => {
            if (this.stopping === done) {
                this.stopping = undefined;
            }
        });

        return done;
    }

    async startChannels(signal: AbortSignal): Promise<void> {
        await this.stopChannels();
        signal.throwIfAborted();

        for (const channel of this.ctx.listChannels()) {
            if (!channel.start) {
                continue;
            }

            await channel.start(this.ctx.engine.channelContext(channel));
            // Record even a late success: startup's internal cleanup must own its stop.
            this.startedChannels.push(channel);
            signal.throwIfAborted();
        }
    }

    /** Stops every started channel once, concurrently; a rejection goes to onError. */
    stopChannels(): Promise<void> {
        if (this.startedChannels.length > 0) {
            const channels = this.startedChannels;

            this.startedChannels = [];

            const previous = this.stoppingChannels ?? Promise.resolve();

            this.stoppingChannels = previous.then(async () => {
                const results = await Promise.allSettled(channels.map((channel) => channel.stop?.()));

                for (const result of results) {
                    if (result.status === 'rejected') {
                        this.ctx.onError(result.reason);
                    }
                }
            });
        }

        return this.stoppingChannels ?? Promise.resolve();
    }

    /**
     * Requeues every `running` or `interrupted` run whose claim expired (or was
     * released), so its next execution resumes from the latest checkpoint.
     * Runs executing here and runs with a live claim are left alone. Also runs
     * on every poll. Resolves the number of runs requeued.
     */
    async recover(): Promise<number> {
        const { data } = await this.ctx.runService.find({ status: [RunStatus.RUNNING, RunStatus.INTERRUPTED] });
        let requeued = 0;

        for (const run of data) {
            const execution = this.ctx.executions.get(run.id);

            if (execution) {
                // cancel() was called on a replica that does not execute the run
                if (run.cancelRequested) {
                    execution.stop ??= 'cancel';
                    execution.controller.abort();
                }

                continue;
            }

            try {
                // atomic: fails while another owner's claim is live
                if (!await this.ctx.runService.claim(run.id, this.ctx.owner, this.ctx.claimTtlMs)) {
                    continue;
                }
            } catch (error) {
                this.ctx.onError(error, run);

                continue;
            }

            try {
                const queued = await this.ctx.runService.update(run.id, {
                    status: RunStatus.QUEUED,
                    claim: undefined,
                    updatedAt: new Date(this.ctx.clock.now()),
                }, { expectStatus: [RunStatus.RUNNING, RunStatus.INTERRUPTED], expectOwner: this.ctx.owner });

                requeued++;
                this.ctx.emit({ type: 'run.updated', run: queued });
            } catch (error) {
                // the run settled since it was listed: drop the claim just taken
                await this.ctx.runService.update(run.id, { claim: undefined }, { expectOwner: this.ctx.owner })
                    .catch(() => {});

                if (!(error instanceof InvalidRunStateError)) {
                    this.ctx.onError(error, run);
                }
            }
        }

        if (requeued > 0 && this.started) {
            void this.ctx.queue.pump();
        }

        return requeued;
    }

    /**
     * Graceful shutdown: stops starting runs (dispatch still stores them
     * `queued`, for another replica), polling and tick; waits up to `timeoutMs`
     * (default 30 000) for in-flight runs, then aborts the rest and marks them
     * `interrupted` with their claim released.
     */
    async drain(opts: { timeoutMs?: number } = {}): Promise<void> {
        this.draining = true;
        // no new inbound before the wait
        await this.ctx.engine.stop();
        await this.ctx.queue.halt();

        let timer: { clear(): void } | undefined;
        const timedOut = new Promise<true>((resolve) => {
            // not unref'd: the process must not exit before the leftovers are marked interrupted
            timer = this.ctx.clock.setTimeout(() => resolve(true), opts.timeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS);
        });

        try {
            const settled = await Promise.race([this.ctx.engine.idle().then(() => false as const), timedOut]);

            if (!settled) {
                return;
            }

            while (this.ctx.executions.size > 0) {
                const pending = this.ctx.executions.values().toArray();

                for (const execution of pending) {
                    execution.stop ??= 'drain';
                    execution.controller.abort();
                }

                await Promise.all(pending.map((execution) => execution.done));
            }

            for (const controller of this.ctx.deliveryControllers) {
                controller.abort();
            }

            await this.ctx.engine.idle();
        } finally {
            timer?.clear();
        }
    }

    /** Resolves when nothing runs, nothing more can be started and no approval delivery is in flight. */
    async idle(): Promise<void> {
        await this.ctx.queue.idle();
        await this.ctx.conversations?.idle();

        while (this.ctx.deliveries.size > 0 || this.ctx.staleCancels.size > 0) {
            await Promise.all([...this.ctx.deliveries, ...this.ctx.staleCancels.values()]);
            await this.ctx.queue.idle();
        }
    }
}
