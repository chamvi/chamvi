/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as pkg from '@chamvi/store-db-vector';

describe('public api', () => {
    it.each([
        'DatabaseKnowledgeChunkRepository',
        'DatabaseKnowledgeDocumentRepository',
        'DatabaseKnowledgeRepository',
        'KNOWLEDGE_VECTOR_DATABASE',
        'KNOWLEDGE_VECTOR_ENTITIES',
        'KNOWLEDGE_VECTOR_MIGRATIONS',
        'KNOWLEDGE_VECTOR_MIGRATIONS_TABLE',
    ])('exports %s', (name) => {
        expect(pkg).toHaveProperty(name);
    });

    it('names its database and migrations table', () => {
        expect(pkg.KNOWLEDGE_VECTOR_DATABASE).toBe('vector');
        expect(pkg.KNOWLEDGE_VECTOR_MIGRATIONS_TABLE).toBe('chamvi_vector_migrations');
    });
});
