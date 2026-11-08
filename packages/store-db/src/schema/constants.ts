/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    AgentRevisionEntity,
    ArtifactEntity,
    CheckpointEntity,
    ConnectionEntity,
    ConnectionEntryEntity,
    ConversationEntity,
    ConversationItemEntity,
    ConversationNoteEntity,

    ConversationOperationEntity,
    DocEntity,
    EffectEntity,
    IdempotencyKeyEntity,
    KvEntity,
    LockEntity,
    RunEntity,
    StepEntity,
} from '../entities/index.ts';
import { UuidBaseline1794096000000 } from '../migrations/index.ts';

export const STORE_ENTITIES = [
    RunEntity,
    StepEntity,
    CheckpointEntity,
    IdempotencyKeyEntity,
    LockEntity,
    EffectEntity,
    KvEntity,
    DocEntity,
    ArtifactEntity,
    AgentRevisionEntity,
    ConversationEntity,
    ConversationItemEntity,
    ConversationNoteEntity,
    ConversationOperationEntity,
    ConnectionEntity,
    ConnectionEntryEntity,
];

export const STORE_MIGRATIONS = [UuidBaseline1794096000000];

export const MIGRATION_LOCK_NAME = 'chamvi:migrations';
