/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidRunStateError, ValidationError } from '@chamvi/core';
import { createWake } from '../indexer/helpers/index.ts';
import { runCollection } from '../indexer/loop.ts';
import { markOrphans } from '../indexer/orphans.ts';
import { syncCollection } from '../indexer/sync.ts';
import type { KnowledgeIndexLock, KnowledgeWake } from '../indexer/types.ts';
import { KNOWLEDGE_MANAGED_POLL_MS } from '../managed/constants.ts';
import { syncManaged } from '../managed/module.ts';
import type { ManagedLoop } from '../managed/types.ts';
import type { KnowledgeCollection } from '../store/types.ts';
import { KnowledgeBase } from './base.ts';

/** The indexing of a knowledge instance: the declared and managed collection loops. */
export abstract class KnowledgeIndexing extends KnowledgeBase {
    start(): void {
        if (this.indexing || this.restart) {
            return;
        }

        const { stopping } = this;

        if (stopping) {
            // a restart waits for the loops still stopping, so two task sets never overlap
            this.restart = true;
            stopping.then(() => {
                if (!this.restart) {
                    return;
                }

                this.restart = false;
                this.begin();
            }, () => {});

            return;
        }

        this.begin();
    }

    protected begin(): void {
        if (this.indexing) {
            return;
        }

        const controller = new AbortController();
        const { signal } = controller;
        const wakes = new Map<string, KnowledgeWake>();
        const embed = (model: string, texts: string[], abortSignal: AbortSignal) => this.embed(model, texts, abortSignal);
        const managed = new Map<string, ManagedLoop>();
        const tasks = [
            markOrphans(this.service, new Set(this.collections.keys()), this.locks, this.owner, this.clock)
                .catch((error: unknown) => this.onError(error, {})),
            ...this.collections.values().map((definition) => {
                const wake = createWake();

                wakes.set(definition.name, wake);

                const task = runCollection({
                    name: definition.name,
                    service: this.service,
                    locks: this.locks,
                    owner: this.owner,
                    clock: this.clock,
                    signal,
                    onError: this.onError,
                    wake,
                    ...(definition.resyncMs === undefined ? {} : { idleMs: definition.resyncMs }),
                    // a record deleted on another replica (#120) is rebuilt without a resync or a restart
                    checkMs: KNOWLEDGE_MANAGED_POLL_MS,
                    pass: (lock, report) => syncCollection({
                        definition,
                        service: this.service,
                        embed,
                        clock: this.clock,
                        signal,
                        lock,
                        onError: report,
                    }),
                });

                // a loop ended by a configuration error takes no sync(): it would answer for nothing
                return task.then(() => {
                    if (wakes.get(definition.name) === wake) {
                        wakes.delete(definition.name);
                    }
                });
            }),
        ];

        this.indexing = {
            controller,
            tasks,
            wakes,
            managed,
        };

        if (this.runManagedPoll) {
            // its first pass runs at once; it never rejects (a failed pass goes to onError)
            this.managedPoll.start().catch(() => {});
        }
    }

    /**
     * One pass of `managedPoll` (at once, then every
     * KNOWLEDGE_MANAGED_POLL_MS): starts a loop per managed record without
     * one (created here before the start, or by another instance) and stops
     * the loops whose record is gone or no longer managed, then marks the
     * declared records this instance does not declare `orphaned` from the
     * same read (`markOrphans()`), so a removed collection settles orphaned
     * once the replicas declaring it are gone. A failed read or mark is
     * reported and tried at the next poll; a pass stopped meanwhile (the
     * component's or the indexing's stop) reports nothing.
     */
    protected async pollManaged(signal: AbortSignal): Promise<void> {
        const { indexing } = this;

        // nothing indexes: no loop to start or stop (a component started before or after start())
        if (!indexing) {
            return;
        }

        const stopped = AbortSignal.any([signal, indexing.controller.signal]);

        try {
            await this.reconcileManaged(indexing, stopped);
        } catch (error) {
            if (!stopped.aborted) {
                throw error;
            }
        }
    }

    protected async reconcileManaged(indexing: NonNullable<KnowledgeIndexing['indexing']>, signal: AbortSignal): Promise<void> {
        // a loop started while the list is read (createCollection, also after a delete) is no stale one
        const before = new Map(indexing.managed);
        const deleted = new Set<string>();
        let records: KnowledgeCollection[];

        this.deletedDuringPoll = deleted;

        try {
            records = await this.service.findCollections();
        } finally {
            this.deletedDuringPoll = undefined;
        }

        if (signal.aborted) {
            return;
        }

        const names = new Set(records
            .filter((record) => record.kind === 'managed' && !this.collections.has(record.name) && !deleted.has(record.name))
            .map((record) => record.name));

        for (const name of names) {
            this.startManaged(name);
        }

        for (const [name, loop] of before) {
            if (!names.has(name) && indexing.managed.get(name) === loop) {
                this.stopManaged(name);
            }
        }

        // start() marks once; every poll again, so a rolling deploy that removed a collection converges
        await markOrphans(this.service, new Set(this.collections.keys()), this.locks, this.owner, this.clock, records);
    }

    /** Starts the loop of a managed collection, unless one runs or indexing is off. */
    protected startManaged(name: string): void {
        const { indexing } = this;

        if (!indexing || indexing.controller.signal.aborted || indexing.managed.has(name) || this.collections.has(name)) {
            return;
        }

        const controller = new AbortController();
        const signal = AbortSignal.any([indexing.controller.signal, controller.signal]);
        const wake = createWake();
        const task = runCollection({
            name,
            service: this.service,
            locks: this.locks,
            owner: this.owner,
            clock: this.clock,
            signal,
            onError: this.onError,
            wake,
            idleMs: KNOWLEDGE_MANAGED_POLL_MS,
            pass: (lock, report) => this.passManaged(name, signal, lock, report),
        });
        const loop: ManagedLoop = {
            controller,
            wake,
            task,
        };

        indexing.managed.set(name, loop);
        indexing.tasks.push(task);

        // a loop that ended (aborted, or a configuration error) is started again by the next poll
        task.then(() => {
            if (indexing.managed.get(name) === loop) {
                indexing.managed.delete(name);
            }

            const index = indexing.tasks.indexOf(task);

            if (index !== -1 && this.indexing === indexing) {
                indexing.tasks.splice(index, 1);
            }
        }, () => {});
    }

    protected stopManaged(name: string): void {
        const loop = this.indexing?.managed.get(name);

        if (!loop) {
            return;
        }

        this.indexing!.managed.delete(name);
        loop.controller.abort();
    }

    protected async passManaged(
        name: string,
        signal: AbortSignal,
        lock: KnowledgeIndexLock,
        report: (error: unknown) => void,
    ): Promise<void> {
        const reembed = this.reembeds.delete(name);

        try {
            await syncManaged({
                name,
                service: this.service,
                embed: (model, texts, abortSignal) => this.embed(model, texts, abortSignal),
                hasModel: (model) => this.hasEmbedding(model),
                ...(this.defaultModel === undefined ? {} : { model: this.defaultModel }),
                reembed,
                clock: this.clock,
                signal,
                lock,
                onError: report,
            });
        } catch (error) {
            // asked for again: the retry re-embeds
            if (reembed) {
                this.reembeds.add(name);
            }

            throw error;
        }
    }

    sync(name: string): void {
        const { indexing } = this;

        if (!indexing) {
            throw new InvalidRunStateError('Knowledge is not started: call start() before sync().');
        }

        const wake = indexing.wakes.get(name);

        if (wake) {
            wake.notify();

            return;
        }

        const managed = indexing.managed.get(name);

        if (!managed) {
            throw new ValidationError(`Knowledge collection "${name}" is not indexed by this app.`);
        }

        this.reembeds.add(name);
        managed.wake.notify();
    }

    async stop(): Promise<void> {
        // a restart still waiting for an earlier stop is dropped
        this.restart = false;

        const { indexing } = this;

        if (!indexing) {
            await this.stopping;

            return;
        }

        this.indexing = undefined;
        indexing.controller.abort();

        const tasks: Promise<unknown>[] = [...indexing.tasks];

        if (this.runManagedPoll) {
            // aborts a pass in flight; settled() waits for it, so a restart never overlaps it
            tasks.push(this.managedPoll.stop().then(() => this.managedPoll.settled?.()));
        }

        const stopping = Promise.allSettled(tasks).then(() => {});

        this.stopping = stopping;

        try {
            await stopping;
        } finally {
            if (this.stopping === stopping) {
                this.stopping = undefined;
            }
        }
    }
}
