/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const KNOWLEDGE_MODULE_NAME = 'chamvi:knowledge';

/** Logged once per setup outside dev when no repository is given. */
export const MEMORY_KNOWLEDGE_WARNING = 'Knowledge is kept in memory: every restart re-embeds.';

/** The managed collections' embedding model, read by `knowledgeModule()`; wins over its `embeddingModel`. */
export const KNOWLEDGE_MODEL_VARIABLE = 'CHAMVI_KNOWLEDGE_MODEL';
