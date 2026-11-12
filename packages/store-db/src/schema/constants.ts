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
    ConnectionSecretEntity,
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
import {
    ConnectionConfig1794230765000,
    RunAgentRevision1794484800000,
    UuidBaseline1794096000000,
} from '../migrations/index.ts';

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
    ConnectionSecretEntity,
];

export const STORE_MIGRATIONS = [UuidBaseline1794096000000, ConnectionConfig1794230765000, RunAgentRevision1794484800000];

export const MIGRATION_LOCK_NAME = 'chamvi:migrations';

export const STORE_LEGACY_SCHEMA_CODE = 'store_legacy_schema';
