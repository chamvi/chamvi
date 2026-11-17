/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { EntityConflictError, EntityDeadlockError } from '@chamvi/store';
import { MemoryEntityRepository, MemoryRegistry } from '@chamvi/store-memory';

type Parent = { id: string; name: string };

type Deferred = { promise: Promise<void>; resolve: () => void };

function deferred(): Deferred {
    const { promise, resolve } = Promise.withResolvers<void>();

    return { promise, resolve };
}

async function ticks(count: number): Promise<void> {
    for (let index = 0; index < count; index++) {
        await Promise.resolve();
    }
}

function createParents(unique: boolean): MemoryEntityRepository<Parent> {
    return new MemoryEntityRepository<Parent>({
        entity: 'parent',
        registry: new MemoryRegistry(),
        key: ['id'],
        unique: unique ? [['name']] : [],
    });
}

function statusOf(result: PromiseSettledResult<unknown>): string {
    if (result.status === 'fulfilled') {
        return 'fulfilled';
    }

    return Error.isError(result.reason) ? result.reason.constructor.name : 'rejected';
}

describe('an aborted memory transaction', () => {
    /*
     * R owns the unique value `dup`. T owns x, S owns z and waits for x.
     * T saves a row named `dup` and reads z in parallel: the read closes
     * T -> S -> T and aborts T, while the save is between two awaits. The
     * save must not put T in the line of `dup`: R, asking for x, would see
     * R -> T -> R and fail, although T's rollback frees x.
     */
    it('takes no lock after a parallel call was refused, so a third transaction is not refused (Promise.all)', async () => {
        for (let delay = 0; delay < 16; delay++) {
            const parents = createParents(true);

            await parents.save(parents.create({ id: 'x', name: 'x' }));
            await parents.save(parents.create({ id: 'z', name: 'z' }));

            const rOwns = deferred();
            const tOwns = deferred();
            const sQueued = deferred();
            const go = deferred();

            const r = parents.transaction(async (repository) => {
                await repository.save(repository.create({ id: 'r', name: 'dup' }));
                rOwns.resolve();
                await go.promise;
                await ticks(delay);
                await repository.findOneById('x');
            });

            const t = parents.transaction(async (repository) => {
                await repository.findOneById('x');
                tOwns.resolve();
                await go.promise;
                await Promise.all([
                    repository.save(repository.create({ id: 'n', name: 'dup' })),
                    repository.findOneById('z'),
                ]);
            });

            await rOwns.promise;
            await tOwns.promise;

            const s = parents.transaction(async (repository) => {
                await repository.findOneById('z');

                // the request on x is in line before the call returns
                const onX = repository.findOneById('x');

                sQueued.resolve();
                await onX;
            });

            const settled = Promise.allSettled([r, t, s]);

            await sQueued.promise;
            go.resolve();

            const results = await settled;

            expect(results.map((result) => statusOf(result)), `delay ${delay}`)
                .toEqual(['fulfilled', 'EntityDeadlockError', 'fulfilled']);
            expect((await parents.findManyBy({})).map((row) => row.id).toSorted(), `delay ${delay}`)
                .toEqual(['r', 'x', 'z']);
        }
    }, 2000);

    it('takes no lock after a parallel call was refused, also when fn swallows the refusal', async () => {
        const parents = createParents(true);

        await parents.save(parents.create({ id: 'x', name: 'x' }));
        await parents.save(parents.create({ id: 'z', name: 'z' }));

        const rOwns = deferred();
        const rRequested = deferred();
        const tOwns = deferred();
        const tRefused = deferred();
        const releaseT = deferred();
        const sQueued = deferred();
        const go = deferred();
        let outcomes: string[] = [];

        const r = parents.transaction(async (repository) => {
            await repository.save(repository.create({ id: 'r', name: 'dup' }));
            rOwns.resolve();
            await tRefused.promise;
            // the save of T is past its next step by now
            await ticks(8);

            const onX = repository.findOneById('x');

            rRequested.resolve();
            await onX;
        });

        const t = parents.transaction(async (repository) => {
            await repository.findOneById('x');
            tOwns.resolve();
            await go.promise;

            const save = repository.save(repository.create({ id: 'n', name: 'dup' }));
            const read = repository.findOneById('z');
            const results = await Promise.allSettled([read]);

            tRefused.resolve();
            results.push(...await Promise.allSettled([save]));
            outcomes = results.map((result) => statusOf(result));
            await releaseT.promise;
        });

        await rOwns.promise;
        await tOwns.promise;

        const s = parents.transaction(async (repository) => {
            await repository.findOneById('z');

            const onX = repository.findOneById('x');

            sQueued.resolve();
            await onX;
        });

        const settled = Promise.allSettled([r, t, s]);

        await sQueued.promise;
        go.resolve();
        await rRequested.promise;
        releaseT.resolve();

        const results = await settled;

        expect(outcomes).toEqual(['EntityDeadlockError', 'EntityDeadlockError']);
        expect(results.map((result) => statusOf(result))).toEqual(['fulfilled', 'EntityDeadlockError', 'fulfilled']);
    }, 2000);

    it('aborted by a conflict drops its waiting requests and takes no further lock', async () => {
        const parents = createParents(true);

        await parents.save(parents.create({ id: 'x', name: 'x' }));
        await parents.save(parents.create({ id: 'y', name: 'y' }));

        const owned = deferred();
        const release = deferred();
        let outcomes: string[] = [];

        const owner = parents.transaction(async (repository) => {
            await repository.findOneById('x');
            owned.resolve();
            await release.promise;
        });

        await owned.promise;

        const aborted = parents.transaction(async (repository) => {
            const results = await Promise.allSettled([
                // waits for the owner, until the conflict below aborts the transaction
                repository.findOneById('x'),
                repository.save(repository.create({ id: 'y', name: 'other' })),
            ]);

            outcomes = results.map((result) => statusOf(result));

            // refused before it takes the free row
            outcomes.push(statusOf((await Promise.allSettled([repository.save(repository.create({ id: 'free', name: 'free' }))]))[0]!));
        });

        // settles while the owner still holds x
        await expect(aborted).rejects.toBeInstanceOf(EntityConflictError);
        expect(outcomes).toEqual(['EntityConflictError', 'EntityConflictError', 'EntityConflictError']);

        release.resolve();
        await owner;

        expect(await parents.findOneById('free')).toBeNull();
    }, 2000);

    it('a lock request of an aborted transaction is refused and takes nothing', async () => {
        const registry = new MemoryRegistry();
        const owner = registry.begin();
        const victim = registry.begin();
        const other = registry.begin();

        await registry.lockRow('e', 'L', owner);
        await registry.lockRow('e', 'M', victim);

        const ownerOnM = registry.lockRow('e', 'M', owner);

        // victim -> owner -> victim
        await expect(registry.lockRow('e', 'L', victim)).rejects.toBeInstanceOf(EntityDeadlockError);

        // a free lock and a held one: neither is taken or queued for
        await expect(registry.lockRow('e', 'free', victim)).rejects.toBeInstanceOf(EntityDeadlockError);
        await expect(registry.lockRow('e', 'L', victim)).rejects.toBeInstanceOf(EntityDeadlockError);
        expect(() => registry.write('e', 'M', { id: 'M' }, victim)).toThrow(EntityDeadlockError);

        // nothing waits for the victim's requests: the free lock is free, L has no line
        await expect(registry.lockRow('e', 'free', other)).resolves.toBeUndefined();

        registry.rollback(victim);
        await ownerOnM;
        registry.commit(owner);

        await expect(registry.lockRow('e', 'L', other)).resolves.toBeUndefined();
        registry.commit(other);
    });

    /*
     * The transaction removes a row and saves a new one under its key
     * without awaiting the save, then throws. A save that goes on after the
     * rollback reads the committed row again: it is refused as a call of an
     * ended transaction, never reported as a conflict.
     */
    it('a save that goes on after the rollback is refused, not answered from the committed rows', async () => {
        for (let before = 0; before < 8; before++) {
            for (let after = 0; after < 4; after++) {
                const parents = createParents(false);

                await parents.save(parents.create({ id: 'p1', name: 'a' }));

                let pending!: Promise<unknown>;

                await expect(parents.transaction(async (repository) => {
                    await repository.remove((await repository.findOneById('p1'))!);
                    pending = ticks(after).then(() => repository.save(repository.create({ id: 'p1', name: 'b' })));
                    pending.catch(() => undefined);
                    await ticks(before);

                    throw new Error('stop');
                })).rejects.toThrow('stop');

                const [result] = await Promise.allSettled([pending]);

                expect(['fulfilled', 'EntityDeadlockError'], `throw after ${before}, save after ${after}`).toContain(statusOf(result!));
                expect(await parents.findOneById('p1')).toEqual({ id: 'p1', name: 'a' });
            }
        }
    }, 2000);

    /*
     * The save is not awaited and `fn` throws a few steps later: wherever
     * the rollback lands, the entity stays a created one and a retry
     * inserts it.
     */
    it('a save cut off by the rollback leaves the entity as created', async () => {
        for (const unique of [false, true]) {
            for (let delay = 0; delay < 16; delay++) {
                const parents = createParents(unique);
                const entity = parents.create({ id: 'p1', name: 'a' });
                let pending!: Promise<unknown>;

                await expect(parents.transaction(async (repository) => {
                    pending = repository.save(entity);
                    pending.catch(() => undefined);
                    await ticks(delay);

                    throw new Error('stop');
                })).rejects.toThrow('stop');

                await Promise.allSettled([pending]);

                expect(await parents.findOneById('p1'), `unique ${unique}, delay ${delay}`).toBeNull();

                await expect(parents.save(entity), `unique ${unique}, delay ${delay}`).resolves.toEqual({ id: 'p1', name: 'a' });
                expect(await parents.findOneById('p1')).toEqual({ id: 'p1', name: 'a' });
            }
        }
    }, 2000);
});
