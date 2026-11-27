/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { EffectRecord } from '@chamvi/core-kit';
import type { IEntityRepository } from '../entity/types.ts';

/**
 * The effect port: the generic entity port on `EffectRecord` (key `id`,
 * `key` unique). `upsert` inserts, or replaces the `result` of the row
 * with the same `key` and keeps its stored `id`: the value it resolves
 * (and every later read) carries the stored `id`, not the one given.
 */
export interface IEffectRepository extends IEntityRepository<EffectRecord> {}
