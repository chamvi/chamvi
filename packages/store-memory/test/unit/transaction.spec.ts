/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    EntityConflictError,
    EntityDeadlockError,
    EntityRelationError,
} from '@chamvi/store';
import { MemoryEntityRepository, MemoryRegistry } from '@chamvi/store-memory';

type Parent = { id: string; name: string };

type Child = { id: string; parentId: string };

type Deferred = { promise: Promise<void>; resolve: () => void };

function deferred(): Deferred {
    const { promise, resolve } = Promise.withResolvers<void>();

    return { promise, resolve };
}

describe('memory transactions', () => {
    let parents: MemoryEntityRepository<Parent>;
    let children: MemoryEntityRepository<Child>;

    beforeEach(() => {
        const registry = new MemoryRegistry();

        parents = new MemoryEntityRepository<Parent>({
            entity: 'parent',
            registry,
            key: ['id'],
            unique: [['name']],
        });
        children = new MemoryEntityRepository<Child>({
            entity: 'child',
            registry,
            key: ['id'],
            references: [{ field: 'parentId', entity: 'parent' }],
        });
    });

    it('a storage error of a write aborts the transaction, also when fn catches it', async () => {
        await parents.save(parents.create({ id: 'p1', name: 'a' }));

        await expect(parents.transaction(async (repository) => {
            await repository.save(repository.create({ id: 'p2', name: 'b' }));

            try {
                await repository.save(repository.create({ id: 'p1', name: 'c' }));
            } catch {
                // swallowed: the transaction stays aborted
            }

            await expect(repository.findOneById('p2')).rejects.toBeInstanceOf(EntityConflictError);
        })).rejects.toBeInstanceOf(EntityConflictError);

        expect(await parents.findOneById('p2')).toBeNull();
    });

    it('a parent removed by another transaction fails the child\'s commit', async () => {
        await parents.save(parents.create({ id: 'p1', name: 'a' }));

        const inserted = deferred();
        const removed = deferred();

        const child = children.transaction(async (repository) => {
            await repository.save(repository.create({ id: 'c1', parentId: 'p1' }));
            inserted.resolve();
            await removed.promise;
        });

        await inserted.promise;
        await parents.remove((await parents.findOneById('p1'))!);
        removed.resolve();

        const error = await child.catch((thrown: unknown) => thrown);

        expect(error).toBeInstanceOf(EntityRelationError);
        expect(error).toMatchObject({ entity: 'child', relation: 'parent' });
        expect(await children.findOneById('c1')).toBeNull();
    });

    it('two transactions writing one unique value end, one with EntityConflictError', async () => {
        const results = await Promise.allSettled([
            parents.save(parents.create({ id: 'p1', name: 'same' })),
            parents.save(parents.create({ id: 'p2', name: 'same' })),
        ]);

        expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
        expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(EntityConflictError);
        expect(await parents.findManyBy({})).toEqual([{ id: 'p1', name: 'same' }]);
    });

    it('a cycle of three transactions ends one with EntityDeadlockError', async () => {
        for (const id of ['p1', 'p2', 'p3']) {
            await parents.save(parents.create({ id, name: id }));
        }

        const locked = [deferred(), deferred(), deferred()];

        const run = (index: number) => parents.transaction(async (repository) => {
            await repository.findOneById(`p${index + 1}`);
            locked[index]!.resolve();
            await Promise.all(locked.map((item) => item.promise));
            await repository.findOneById(`p${((index + 1) % 3) + 1}`);
        });

        const results = await Promise.allSettled([run(0), run(1), run(2)]);
        const rejected = results.filter((result) => result.status === 'rejected');

        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(EntityDeadlockError);
    });

    it('two parallel waits of one transaction on one row leave the row free once it ends', async () => {
        await parents.save(parents.create({ id: 'p1', name: 'a' }));

        const locked = deferred();
        const release = deferred();

        const first = parents.transaction(async (repository) => {
            await repository.findOneById('p1');
            locked.resolve();
            await release.promise;
        });

        await locked.promise;

        const second = parents.transaction(async (repository) => {
            await Promise.all([repository.findOneById('p1'), repository.findOneById('p1')]);
        });

        release.resolve();
        await first;
        await second;

        await parents.transaction(async (repository) => {
            await repository.findOneById('p1');
        });
    }, 2000);

    it('a wait of a transaction that ended meanwhile leaves the row free', async () => {
        await parents.save(parents.create({ id: 'p1', name: 'a' }));
        await parents.save(parents.create({ id: 'p2', name: 'b' }));

        const locked = deferred();
        const release = deferred();

        const first = parents.transaction(async (repository) => {
            await repository.findOneById('p2');
            locked.resolve();
            await release.promise;
        });

        await locked.promise;

        await expect(parents.transaction(async (repository) => {
            await Promise.all([
                repository.findOneById('p2'),
                repository.save(repository.create({ id: 'p1', name: 'c' })),
            ]);
        })).rejects.toBeInstanceOf(EntityConflictError);

        release.resolve();
        await first;

        await parents.transaction(async (repository) => {
            await repository.findOneById('p2');
        });
    }, 2000);

    it('a cycle that a lock handoff would close ends one transaction with EntityDeadlockError', async () => {
        await parents.save(parents.create({ id: 'x', name: 'x' }));
        await parents.save(parents.create({ id: 'y', name: 'y' }));

        const xLocked = deferred();
        const yLocked = deferred();
        const releaseX = deferred();
        const secondQueued = deferred();
        const thirdQueued = deferred();

        const first = parents.transaction(async (repository) => {
            await repository.findOneById('x');
            xLocked.resolve();
            await releaseX.promise;
        });

        const third = parents.transaction(async (repository) => {
            await repository.findOneById('y');
            yLocked.resolve();
            await secondQueued.promise;

            // the request on x is in line (or refused) before the call returns
            const onX = repository.findOneById('x');

            thirdQueued.resolve();
            await onX;
        });

        await xLocked.promise;
        await yLocked.promise;

        const second = parents.transaction(async (repository) => {
            const both = Promise.all([repository.findOneById('x'), repository.findOneById('y')]);

            secondQueued.resolve();
            await both;
        });

        const settled = Promise.allSettled([first, second, third]);

        // the third requests x behind the second, then the first ends: x goes to the second
        await thirdQueued.promise;
        releaseX.resolve();

        const results = await settled;
        const rejected = results.filter((result) => result.status === 'rejected');

        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(EntityDeadlockError);
        expect(results[1]!.status).toBe('fulfilled');
    }, 2000);

    it('a write that reaches the registry after its transaction ended is refused, not lost', async () => {
        const registry = new MemoryRegistry();
        let delayed = false;

        class SlowRepository extends MemoryEntityRepository<Parent> {
            protected override async write(entity: Parent, key: string, row: Record<string, any>, stored?: Record<string, any>): Promise<void> {
                if (delayed) {
                    await new Promise((resolve) => {
                        setTimeout(resolve, 10);
                    });
                }

                return super.write(entity, key, row, stored);
            }
        }

        const plain = new SlowRepository({
            entity: 'plain',
            registry,
            key: ['id'],
        });

        await plain.save(plain.create({ id: 'p1', name: 'a' }));

        delayed = true;

        let pending!: Promise<unknown>;

        await plain.transaction(async (repository) => {
            const row = (await repository.findOneById('p1'))!;

            repository.merge(row, { name: 'b' });
            // not awaited: the transaction commits before the write lands
            pending = repository.save(row);
        });

        await expect(pending).rejects.toBeInstanceOf(EntityDeadlockError);
        expect(await plain.findOneById('p1')).toEqual({ id: 'p1', name: 'a' });
    }, 2000);

    it('a row is the same across two repositories of one registry', async () => {
        const registry = new MemoryRegistry();
        const first = new MemoryEntityRepository<Parent>({
            entity: 'parent',
            registry,
            key: ['id'],
        });
        const second = new MemoryEntityRepository<Parent>({
            entity: 'parent',
            registry,
            key: ['id'],
        });

        await first.save(first.create({ id: 'p1', name: 'a' }));

        expect(await second.findOneById('p1')).toEqual({ id: 'p1', name: 'a' });
    });

    it('a save of a read row writes the changed fields only', async () => {
        await parents.save(parents.create({ id: 'p1', name: 'a' }));

        const stale = (await parents.findOneById('p1'))!;
        const fresh = (await parents.findOneById('p1'))!;

        parents.merge(fresh, { name: 'b' });
        await parents.save(fresh);
        await parents.save(stale);

        expect(await parents.findOneById('p1')).toEqual({ id: 'p1', name: 'b' });
    });
});
