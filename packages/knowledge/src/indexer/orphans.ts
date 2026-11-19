/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import type { IClock, ILockService } from '@chamvi/core';
import { lockKey } from '../service/helpers/index.ts';
import type { IKnowledgeService } from '../service/types.ts';
import type { KnowledgeCollection } from '../store/types.ts';
import { KNOWLEDGE_LOCK_TTL_MS } from './constants.ts';
import { isLeaseLost, isRepositoryNotFound } from './helpers/index.ts';

/**
 * Marks every declared record without a definition `orphaned`: kept with its
 * documents and chunks, searchable by no agent. Each mark is written under
 * the record's `knowledge:<name>` lock (a held one means a replica that
 * declares it is syncing it: left alone), re-read once the lock is held and
 * its fence claimed with the lock's token; a claim or mark the fence refuses
 * (another owner took the lock meanwhile) or that finds the row deleted
 * leaves the record alone too. Each call holds the locks under an owner of
 * its own (`<owner>:orphans:<uuid>`): a mark stalled past the lock TTL then
 * never releases the lease a later mark of the same instance holds.
 * `records` is a list the caller already read (the managed poll's), else
 * `findCollections()` is read.
 */
export async function markOrphans(
    service: IKnowledgeService,
    declared: ReadonlySet<string>,
    locks: Pick<ILockService, 'acquire' | 'release'>,
    owner: string,
    clock: IClock,
    records?: readonly KnowledgeCollection[],
): Promise<void> {
    const isOrphan = (record: KnowledgeCollection | undefined): record is KnowledgeCollection => record !== undefined &&
        record.kind === 'declared' &&
        record.status !== 'orphaned' &&
        !declared.has(record.name);
    const holder = `${owner}:orphans:${randomUUID()}`;

    for (const candidate of records ?? await service.findCollections()) {
        if (!isOrphan(candidate)) {
            continue;
        }

        const key = lockKey(candidate.name);

        const token = await locks.acquire(key, holder, KNOWLEDGE_LOCK_TTL_MS);

        if (token === undefined) {
            continue;
        }

        try {
            const fence = await service.claimFence(candidate.name, token);
            const record = await service.findOneCollection(candidate.name);

            if (fence && isOrphan(record)) {
                await service.saveCollection({
                    ...record,
                    status: 'orphaned',
                    updatedAt: new Date(clock.now()),
                }, { fence });
            }
        } catch (error) {
            // another owner took the lock, or the record was deleted meanwhile: left to them
            if (!isLeaseLost(error) && !isRepositoryNotFound(error)) {
                throw error;
            }
        } finally {
            await locks.release(key, holder);
        }
    }
}
