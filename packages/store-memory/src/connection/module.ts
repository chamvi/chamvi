/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionRecord, IConnectionRepository, Lock } from '@chamvi/store';
import { MemoryEntityRepository } from '../entity/module.ts';
import type { MemoryRepositoryOptions } from '../entity/types.ts';
import { MemoryLockRepository } from '../lock/module.ts';
import type { MemoryTransaction } from '../registry/types.ts';
import { MemoryConnectionEntryRepository } from './entry.ts';
import { MemoryConnectionSecretRepository } from './secret.ts';

/**
 * Connections in the registry (entity `connection`, key `id`, `name`
 * unique), stored as given, with their entries and secrets as child
 * repositories on the same registry; a transaction binds all three. The
 * fence is the `lock` row of the registry the lock repositories (and so
 * the lock service) of this registry write: inside a transaction
 * `findFence` locks that row, so it waits for a lock transaction in flight
 * and holds off the next one until this transaction ends.
 */
export class MemoryConnectionRepository extends MemoryEntityRepository<ConnectionRecord> implements IConnectionRepository {
    entries: MemoryConnectionEntryRepository;

    secrets: MemoryConnectionSecretRepository;

    /** The lock rows of the registry, read by `findFence` only. */
    protected locks: MemoryLockRepository;

    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'connection',
            registry: options.registry,
            key: ['id'],
            unique: [['name']],
        });

        this.entries = new MemoryConnectionEntryRepository(options);
        this.secrets = new MemoryConnectionSecretRepository(options);
        this.locks = new MemoryLockRepository(options);
    }

    async findFence(name: string): Promise<Lock | null> {
        return this.locks.findOneBy({ key: name });
    }

    protected override bind(transaction: MemoryTransaction): this {
        const bound = super.bind(transaction);

        bound.entries = this.bindChild(this.entries, transaction);
        bound.secrets = this.bindChild(this.secrets, transaction);
        bound.locks = this.bindChild(this.locks, transaction);

        return bound;
    }
}
