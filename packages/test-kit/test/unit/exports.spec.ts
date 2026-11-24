/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import type { IConnectionService } from '@chamvi/core';
import type { IConversationRepository, ILockRepository } from '@chamvi/store';
import * as kit from '@chamvi/test-kit';

describe('public api', () => {
    it('keeps the database helpers\' internals and has no fake repository (MemoryEntityRepository of @chamvi/store-memory serves service specs)', () => {
        expect(kit).not.toHaveProperty('FakeEntityRepository');
        expect(kit).not.toHaveProperty('loadDatabaseStore');
        expect(kit).not.toHaveProperty('STORE_DB_PACKAGE');
    });

    it.each([
        'ControllableClock',
        'createFakeGithub',
        'createTestEngine',
        'createTestDataSource',
        'createGitFixture',
        'describeAgentRevisionRepositoryContract',
        'describeArtifactRepositoryContract',
        'describeCheckpointRepositoryContract',
        'describeConnectionRepositoryContract',
        'describeConversationRepositoryContract',
        'describeEffectRepositoryContract',
        'describeEntityRepositoryContract',
        'describeIdempotencyRepositoryContract',
        'describeKnowledgeRepositoryContract',
        'describeLimitRepositoryContract',
        'describeLockRepositoryContract',
        'describeRunRepositoryContract',
        'describeStateRepositoryContract',
        'describeStepRepositoryContract',
        'describeWorkspaceContract',
        'testUuid',
        'mockModel',
        'mockEmbeddingModel',
        'textModel',
        'approvalModel',
        'failingModel',
        'fakeSkillRuntime',
    ])('exports %s', (name) => {
        expect(kit).toHaveProperty(name);
        expect(kit[name as keyof typeof kit]).toBeTypeOf('function');
    });

    it('requires the purge ordering hook of the lock and idempotency port suites', () => {
        expectTypeOf<kit.LockRepositoryContractInput['untilBlocked']>().toEqualTypeOf<() => Promise<void>>();
        expectTypeOf<kit.IdempotencyRepositoryContractInput['untilBlocked']>().toEqualTypeOf<() => Promise<void>>();
        expectTypeOf<kit.LimitRepositoryContractInput['untilBlocked']>().toEqualTypeOf<() => Promise<void>>();
        expectTypeOf<kit.ConnectionRepositoryContractInput['untilBlocked']>().toEqualTypeOf<() => Promise<void>>();
        expectTypeOf<kit.ConnectionRepositoryContractStore['locks']>().toEqualTypeOf<ILockRepository>();
        expectTypeOf<kit.ConversationRepositoryContractInput['untilBlocked']>().toEqualTypeOf<() => Promise<void>>();
        expectTypeOf<kit.ConversationRepositoryContractStore['repository']>().toEqualTypeOf<IConversationRepository>();
        expectTypeOf<ReturnType<typeof kit.createTestEngine>['connectionService']>().toEqualTypeOf<IConnectionService | undefined>();
    });
});
