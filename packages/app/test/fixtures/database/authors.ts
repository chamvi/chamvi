/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/* eslint-disable max-classes-per-file */
import { ForceLoggedInMiddleware, RequiredJsonBodyMiddleware } from '@chamvi/http';
import { EntityRepositoryAdapter } from '@chamvi/store-db';
import type { EntityFindManyResult } from '@chamvi/store';
import {
    DBody,
    DContext,
    DController,
    DGet,
    DPost,
} from '@routup/decorators';
import type { IAppEvent } from 'routup';
import type { DataSource, EntityManager } from 'typeorm';
import { decodeQuery, defineSchema } from '@chamvi/app';
import { AuthorEntity } from './entities.ts';

export type Author = {
    id: string;
    name: string;
};

/** What `GET /authors` takes: a filter on the id and the name, a sort by name, pages of at most 10. */
export const AUTHOR_LIST_SCHEMA = defineSchema<Author>({
    entity: AuthorEntity,
    filters: ['id', 'name'],
    sorts: ['name'],
    maxLimit: 10,
    defaultLimit: 2,
});

/** An app's repository over its own data source: the adapter base of `@chamvi/store-db`. */
export class AuthorRepository extends EntityRepositoryAdapter<Author, AuthorEntity> {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(AuthorEntity), {
            entity: 'author',
            alias: 'author',
            target: AuthorEntity,
        });
    }

    withManager(manager: EntityManager): this {
        return new AuthorRepository(manager) as this;
    }
}

/** `POST /authors`: stores an author as given; `GET /authors`: a page of them, as the list schema allows. */
@DController('/authors')
export class AuthorController {
    protected repository: AuthorRepository;

    constructor(repository: AuthorRepository) {
        this.repository = repository;
    }

    @DGet('', [ForceLoggedInMiddleware])
    async list(@DContext() event: IAppEvent): Promise<EntityFindManyResult<Author>> {
        return this.repository.findMany(decodeQuery(event.searchParams, AUTHOR_LIST_SCHEMA));
    }

    @DPost('', [RequiredJsonBodyMiddleware])
    async create(@DBody() body: Author): Promise<Author> {
        return this.repository.save(this.repository.create(body));
    }
}
