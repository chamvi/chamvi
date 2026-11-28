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
    LimitUseEntity,
    LockEntity,
    LockTokenEntity,
    RunEntity,
    StepEntity,
} from '../entities/index.ts';
import {
    ConnectionsRevisionsItemBytes1794230765000,
    LimitUses1795552285096,
    LockTokens1795093873329,
    UuidBaseline1794096000000,
    UuidIds1795856376161,
} from '../migrations/index.ts';

export const STORE_ENTITIES = [
    RunEntity,
    StepEntity,
    CheckpointEntity,
    IdempotencyKeyEntity,
    LockEntity,
    LockTokenEntity,
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
    LimitUseEntity,
];

export const STORE_MIGRATIONS = [
    UuidBaseline1794096000000,
    ConnectionsRevisionsItemBytes1794230765000,
    LockTokens1795093873329,
    LimitUses1795552285096,
    UuidIds1795856376161,
];

export const MIGRATION_LOCK_NAME = 'chamvi:migrations';

export const STORE_LEGACY_SCHEMA_CODE = 'store_legacy_schema';
