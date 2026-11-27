/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { AgentRevisionRecord } from '@chamvi/core-kit';
import type { IEntityRepository } from '../entity/types.ts';

/**
 * The agent revision port: the generic entity port on
 * `AgentRevisionRecord` (key `id`, `agent` unique). `upsert` inserts, or
 * replaces the `hash` and `changedAt` of the row with the same `agent`
 * and keeps its stored `id`: the value it resolves (and every later read)
 * carries the stored `id`, not the one given. A sort by `agent` orders by
 * code point.
 */
export interface IAgentRevisionRepository extends IEntityRepository<AgentRevisionRecord> {}
