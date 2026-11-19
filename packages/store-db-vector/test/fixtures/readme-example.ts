import type { EmbeddingModel } from 'ai';
import { createApp } from '@chamvi/app';
import type { IApp } from '@chamvi/app';
import { folder, knowledgeCollection } from '@chamvi/knowledge';
import { knowledgeModule } from '@chamvi/knowledge/module';
import { vectorStoreModule } from '@chamvi/store-db-vector';

export function createSupportApp(input: { handbook: string; embedding: EmbeddingModel }): IApp {
    return createApp({
        agents: [],
        modules: [
            // the knowledge tables in the database of DATABASE_URL, beside chamvi's store
            vectorStoreModule(),
            knowledgeModule({
                collections: [
                    knowledgeCollection('handbook', { model: input.embedding, sources: [folder(input.handbook)] }),
                ],
            }),
        ],
    });
}
